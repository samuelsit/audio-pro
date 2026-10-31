import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { preparerBaseJetable, viderBaseJetable } from '@ha/db/admin';

import { CHIFFREMENT_TEST, urlBaseJetable, urlsDesRoles } from '../test/env';

// Usage : pnpm demo:devis <sortie.pdf>
// Rejoue le parcours avec les vrais services et Chromium, sur la base jetable E2E repartie de zéro :
// seed, extrait de la LPP, dossier, prescription, devis, émission. Données fictives uniquement.

const RACINE = path.join(import.meta.dirname, '../../..');
const CLAIRE_DURAND = '019a3000-0000-7000-8000-000000000501';
const CENTRE_NORD = '019a3000-0000-7000-8000-0000000000a1';
const SCAN_FICTIF = Buffer.from('%PDF-1.7 ordonnance fictive', 'utf8');

async function main(): Promise<void> {
  const argument = process.argv.slice(2).find((a) => a !== '--');
  if (!argument) {
    throw new Error('Usage : pnpm demo:devis <sortie.pdf>');
  }
  const sortie = path.resolve(process.env['INIT_CWD'] ?? process.cwd(), argument);

  const url = urlBaseJetable('DATABASE_URL_E2E');
  await preparerBaseJetable(url);
  await viderBaseJetable(url);
  execFileSync('pnpm', ['run', 'seed'], {
    cwd: path.join(RACINE, 'packages/db'),
    env: { ...process.env, ...urlsDesRoles(url), ...CHIFFREMENT_TEST },
    stdio: 'pipe',
  });
  Object.assign(process.env, CHIFFREMENT_TEST, urlsDesRoles(url), {
    DOCUMENTS_STOCKAGE: 'memoire',
  });

  // Après l'environnement : les clients Prisma lisent leur URL au premier appel.
  const { prisma } = await import('@ha/db/admin');
  const { chargerUtilisateurConnecte } = await import('../server/auth/acces');
  const { fermerConnexionsLpp, importerLpp } = await import('../server/lpp/importer');
  const { creerDevis, emettreDevis, imprimerDevis } = await import('../server/services/devis');
  const { creerDossier, enregistrerPrescription } = await import('../server/services/dossiers');
  const { aujourdhui } = await import('../server/services/patients');

  await importerLpp(path.join(RACINE, 'fixtures/lpp/908'));
  const compte = await prisma().utilisateur.findUniqueOrThrow({
    where: { email: 'camille.audio@exemple.test' },
    select: { id: true, praticien: { select: { id: true } } },
  });
  const acteur = await chargerUtilisateurConnecte(compte.id);
  if (!acteur || !compte.praticien) {
    throw new Error('Compte de démonstration introuvable : relancer le seed.');
  }
  const [classeI, classeII, piles, kit, prescripteur] = await Promise.all([
    prisma().modeleAideAuditive.findFirstOrThrow({ where: { nom: 'Aurore 1 C' } }),
    prisma().modeleAideAuditive.findFirstOrThrow({ where: { nom: 'Aurore 7 R' } }),
    prisma().accessoire.findFirstOrThrow({ where: { nom: 'Piles 312 Démo (6)' } }),
    prisma().accessoire.findFirstOrThrow({ where: { nom: 'Kit d’entretien Démo' } }),
    prisma().prescripteur.findFirstOrThrow({ where: { specialite: 'ORL' } }),
  ]);

  const dossierId = await creerDossier(acteur, CLAIRE_DURAND, {
    centreId: CENTRE_NORD,
    praticienId: compte.praticien.id,
    oreilles: 'LES_DEUX',
    typeDroite: 'PRIMO',
    typeGauche: 'PRIMO',
    surdicecite: false,
  });
  await enregistrerPrescription(
    acteur,
    dossierId,
    {
      prescripteurId: prescripteur.id,
      datePrescription: aujourdhui(),
      oreilles: 'LES_DEUX',
      mentionRenouvellement: false,
      statutAttendu: 'BROUILLON',
      forcer: false,
      motifForcage: '',
    },
    SCAN_FICTIF,
  );

  const aide = (modeleId: string, prixAvantRemise: string, prix: string) => ({
    modeleId,
    prixAvantRemise,
    prix,
  });
  const devisId = await creerDevis(acteur, dossierId, {
    lieuEmission: 'Lille',
    validiteMois: 2,
    tauxAmo: 60,
    refusOffreC2S: false,
    contratResponsable: true,
    bobineTPresentee: true,
    ficheTechniqueJointe: true,
    depotGarantie: '',
    datePrecedentDroite: '',
    datePrecedentGauche: '',
    statutAttendu: 'PRESCRIPTION_OK',
    offres: [
      {
        rubrique: 'OFFRE_100_SANTE',
        aideDroite: aide(classeI.id, '950,00', '950,00'),
        aideGauche: aide(classeI.id, '950,00', '950,00'),
        consommables: [
          { accessoireId: piles.id, quantite: 4, prixAvantRemise: '1,50', prix: '1,50' },
        ],
        amcDroite: '710,00',
        amcGauche: '710,00',
        amcConsommables: '2,40',
      },
      {
        rubrique: 'AUTRE_OFFRE',
        aideDroite: aide(classeII.id, '1 890,00', '1 790,00'),
        aideGauche: aide(classeII.id, '1 890,00', '1 790,00'),
        consommables: [
          { accessoireId: kit.id, quantite: 1, prixAvantRemise: '15,00', prix: '15,00' },
        ],
        amcDroite: '500,00',
        amcGauche: '500,00',
        amcConsommables: '',
      },
    ],
  });
  await emettreDevis(acteur, devisId, { statutAttendu: 'BROUILLON' });
  const { contenu } = await imprimerDevis(acteur, devisId);
  await writeFile(sortie, contenu);
  console.log(`Devis de démonstration écrit dans ${sortie}.`);
  await fermerConnexionsLpp();
}

try {
  await main();
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
}
