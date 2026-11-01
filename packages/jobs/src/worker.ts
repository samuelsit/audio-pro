import path from 'node:path';

import {
  chargerCleLienRdv,
  chargerConfigurationS3,
  chargerSignatureCaisse,
  chargerTrousseau,
  ChiffreurAesGcm,
  DocumentStoreChiffre,
  FakeNotifier,
  HacheurSha256,
  S3DocumentStore,
  SignatureLienDocument,
  SignatureLienRdv,
  SystemClock,
} from '@ha/adapters';
import { config } from 'dotenv';

import { ABONNES } from './abonnes';
import { FileTravaux } from './file';
import { repartirCaisse, travailCaisseNuit } from './travaux/caisse-nuit';
import { travailDiagnostic } from './travaux/diagnostic';
import { repartirDiffusion, travailDiffusion } from './travaux/diffuser-evenements';
import { repartirEnvois, travailEnvoi } from './travaux/envoyer-notifications';
import { repartirPurgeLiens, travailPurgeLiensDocument } from './travaux/purger-liens-document';
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

const file = new FileTravaux(url);
await file.demarrer();
await file.declarer(travailDiagnostic);
await file.ecouter(travailDiagnostic);

const diffusion = travailDiffusion(ABONNES);
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

// À VÉRIFIER : aucun fournisseur de SMS ni d'e-mail n'est retenu (ADR-021). Sans lui, les autres travaux tournent
// quand même : la réservation en ligne, elle, ne peut pas s'ouvrir, faute de pouvoir envoyer le code.
const urlPublique = process.env.URL_PUBLIQUE;
if (process.env.NOTIFIER === 'simulation' && process.env.NODE_ENV !== 'production' && urlPublique) {
  const envoi = travailEnvoi({
    notifier: new FakeNotifier(process.env.NOTIFIER_SIMULATION_FICHIER),
    signature: new SignatureLienRdv(chargerCleLienRdv(process.env)),
    signatureDocument: new SignatureLienDocument(chargerCleLienRdv(process.env)),
    urlPublique,
  });
  await file.declarer(envoi, { expireInSeconds: 120 });
  await file.ecouter(envoi);
  await file.planifierTransverse('repartir-notifications', '* * * * *', () =>
    repartirEnvois(file, envoi),
  );
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
  documents:
    process.env.DOCUMENTS_STOCKAGE !== 'memoire' && process.env.S3_BUCKET
      ? new DocumentStoreChiffre(
          new S3DocumentStore(chargerConfigurationS3(process.env)),
          new ChiffreurAesGcm(chargerTrousseau(process.env)),
        )
      : null,
});
await file.declarer(caisseNuit, { expireInSeconds: 1800 });
await file.ecouter(caisseNuit);
await file.planifierTransverse('repartir-caisse', '20 0 * * *', () =>
  repartirCaisse(file, caisseNuit),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void file.arreter();
  });
}
