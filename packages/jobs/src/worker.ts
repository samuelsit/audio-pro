import path from 'node:path';

import {
  chargerCleEmpreinte,
  chargerCleLienRdv,
  chargerConfigurationS3,
  chargerSignatureCaisse,
  chargerTrousseau,
  ChiffreurAesGcm,
  creerNotifierDepuisEnv,
  creerRenduPdfDepuisEnv,
  DocumentStoreChiffre,
  EmpreinteAdresse,
  FakeBoiteFactures,
  HacheurSha256,
  notifierActif,
  PdfTexteExtracteurFacture,
  S3DocumentStore,
  SignatureLienCommande,
  SignatureLienDesinscription,
  SignatureLienDocument,
  SignatureLienRdv,
  SystemClock,
} from '@ha/adapters';
import { config } from 'dotenv';

import { creerAbonnes } from './abonnes';
import { FileTravaux } from './file';
import { repartirCaisse, travailCaisseNuit } from './travaux/caisse-nuit';
import { travailDiagnostic } from './travaux/diagnostic';
import { repartirDiffusion, travailDiffusion } from './travaux/diffuser-evenements';
import { repartirEnvois, travailEnvoi } from './travaux/envoyer-notifications';
import { repartirScenarios, travailScenarios } from './travaux/declencher-scenarios';
import { repartirCourriers, travailCourriers } from './travaux/generer-courriers';
import { repartirCampagnes, travailCampagnes } from './travaux/lancer-campagnes';
import {
  releverOppositions,
  repartirReleveEnvois,
  travailReleveEnvois,
} from './travaux/relever-envois';
import { repartirPurgeLiens, travailPurgeLiensDocument } from './travaux/purger-liens-document';
import { repartirRelances, travailRelanceCommandes } from './travaux/relancer-commandes';
import { repartirReleve, travailReleveFactures } from './travaux/relever-factures';
import {
  purgerLimitations,
  repartirPurge,
  travailPurgeReservations,
} from './travaux/purger-reservations';

// Ouvrier : `pnpm jobs:worker`. Tourne à part de l'application web.
config({ path: path.join(import.meta.dirname, '../../../.env'), quiet: true });

// Sans ces variables, mieux vaut refuser de démarrer qu'échouer sur chaque travail.
const url = process.env.DATABASE_URL_JOBS;
if (!url || !process.env.DATABASE_URL || !process.env.DATABASE_URL_PLATEFORME) {
  throw new Error(
    'DATABASE_URL_JOBS, DATABASE_URL et DATABASE_URL_PLATEFORME sont requis (voir .env.example).',
  );
}
chargerTrousseau(process.env);
// Les messages aux patients se comparent aux oppositions par cette empreinte : sans clé, rien ne peut partir.
const empreinteAdresse = new EmpreinteAdresse(chargerCleEmpreinte(process.env));

const file = new FileTravaux(url);
await file.demarrer();
await file.declarer(travailDiagnostic);
await file.ecouter(travailDiagnostic);

const urlPublique = process.env.URL_PUBLIQUE;
const communication = notifierActif(process.env) && urlPublique ? { urlPublique } : null;
const dependancesMessages = communication && {
  empreinte: empreinteAdresse,
  urlPublique: communication.urlPublique,
};

const diffusion = travailDiffusion(creerAbonnes(dependancesMessages));
await file.declarer(diffusion);
await file.ecouter(diffusion);
await file.planifierTransverse('repartir-evenements', '* * * * *', () =>
  repartirDiffusion(file, diffusion),
);

await file.declarer(travailPurgeReservations);
await file.ecouter(travailPurgeReservations);
await file.planifierTransverse('repartir-purge-reservations', '7 * * * *', () =>
  repartirPurge(file, travailPurgeReservations),
);
await file.planifierTransverse('purger-limitations', '17 3 * * *', purgerLimitations);

// Les bons de commande et les archives de caisse exigent un vrai stockage : la mémoire de l'application n'est pas
// celle de l'ouvrier.
const documentsChiffres =
  process.env.DOCUMENTS_STOCKAGE !== 'memoire' && process.env.S3_BUCKET
    ? new DocumentStoreChiffre(
        new S3DocumentStore(chargerConfigurationS3(process.env)),
        new ChiffreurAesGcm(chargerTrousseau(process.env)),
      )
    : null;

// Sans fournisseur, les autres travaux tournent quand même : aucun message au patient ne part.
if (dependancesMessages) {
  const notifier = creerNotifierDepuisEnv(process.env);
  const envoi = travailEnvoi({
    notifier,
    signature: new SignatureLienRdv(chargerCleLienRdv(process.env)),
    signatureDocument: new SignatureLienDocument(chargerCleLienRdv(process.env)),
    signatureCommande: new SignatureLienCommande(chargerCleLienRdv(process.env)),
    signatureDesinscription: new SignatureLienDesinscription(chargerCleLienRdv(process.env)),
    empreinte: empreinteAdresse,
    documents: documentsChiffres,
    urlPublique: dependancesMessages.urlPublique,
  });
  await file.declarer(envoi, { expireInSeconds: 120 });
  await file.ecouter(envoi);
  await file.planifierTransverse('repartir-notifications', '* * * * *', () =>
    repartirEnvois(file, envoi),
  );

  const scenarios = travailScenarios(dependancesMessages);
  await file.declarer(scenarios, { expireInSeconds: 900 });
  await file.ecouter(scenarios);
  await file.planifierTransverse('repartir-scenarios', '11 * * * *', () =>
    repartirScenarios(file, scenarios),
  );

  const campagnes = travailCampagnes(dependancesMessages);
  await file.declarer(campagnes, { expireInSeconds: 900 });
  await file.ecouter(campagnes);
  await file.planifierTransverse('repartir-campagnes', '* * * * *', () =>
    repartirCampagnes(file, campagnes),
  );

  const releveEnvois = travailReleveEnvois({ notifier });
  await file.declarer(releveEnvois);
  await file.ecouter(releveEnvois);
  await file.planifierTransverse('repartir-releve-envois', '*/10 * * * *', () =>
    repartirReleveEnvois(file, releveEnvois),
  );
  await file.planifierTransverse('relever-oppositions', '*/5 * * * *', () =>
    releverOppositions({ notifier, empreinte: empreinteAdresse }),
  );

  // Les lettres passent par le vrai stockage : le PDF se télécharge depuis l'application.
  if (documentsChiffres) {
    const courriers = travailCourriers({
      notifier,
      documents: documentsChiffres,
      pdf: creerRenduPdfDepuisEnv(process.env),
    });
    await file.declarer(courriers, { expireInSeconds: 1800 });
    await file.ecouter(courriers);
    await file.planifierTransverse('repartir-courriers', '13 * * * *', () =>
      repartirCourriers(file, courriers),
    );
  }
} else {
  console.warn('Notifications en ligne désactivées : aucun fournisseur configuré.');
}

// Le compte rendu figé d'un lien n'existe que sur le stockage S3 : sans lui, rien à purger.
if (process.env.DOCUMENTS_STOCKAGE !== 'memoire' && process.env.S3_BUCKET) {
  const purgeLiens = travailPurgeLiensDocument(
    new S3DocumentStore(chargerConfigurationS3(process.env)),
  );
  await file.declarer(purgeLiens);
  await file.ecouter(purgeLiens);
  await file.planifierTransverse('repartir-purge-liens', '37 3 * * *', () =>
    repartirPurgeLiens(file, purgeLiens),
  );
}

// Avant l'ouverture des centres : la veille se fige, le mois écoulé s'archive. L'archivage demande un vrai stockage.
const caisseNuit = travailCaisseNuit({
  horloge: new SystemClock(),
  hacheur: new HacheurSha256(),
  signature: chargerSignatureCaisse(process.env),
  documents: documentsChiffres,
});
await file.declarer(caisseNuit, { expireInSeconds: 1800 });
await file.ecouter(caisseNuit);
await file.planifierTransverse('repartir-caisse', '20 0 * * *', () =>
  repartirCaisse(file, caisseNuit),
);

const relanceCommandes = travailRelanceCommandes();
await file.declarer(relanceCommandes);
await file.ecouter(relanceCommandes);
await file.planifierTransverse('repartir-relances-commandes', '23 * * * *', () =>
  repartirRelances(file, relanceCommandes),
);

// À VÉRIFIER : aucun fournisseur d'e-mail entrant n'est retenu, docs/vendor n'en documente aucun. D'ici là, seul le
// dépôt à l'écran fait entrer des factures ; la simulation sert au développement.
if (
  process.env.BOITE_FACTURES === 'simulation' &&
  process.env.NODE_ENV !== 'production' &&
  documentsChiffres
) {
  const releve = travailReleveFactures({
    boite: new FakeBoiteFactures(),
    extracteur: new PdfTexteExtracteurFacture(),
    documents: documentsChiffres,
  });
  await file.declarer(releve);
  await file.ecouter(releve);
  await file.planifierTransverse('repartir-releve-factures', '*/15 * * * *', () =>
    repartirReleve(file, releve),
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void file.arreter();
  });
}
