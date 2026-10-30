import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { lireDbf, type ChampDbf } from '@ha/adapters';

// Régénère fixtures/lpp depuis la base complète, déposée localement dans docs/ref/lpp/908 :
//   pnpm --filter @ha/web exec tsx scripts/extraire-fixtures-lpp.ts
// 908 : extrait réel. 907 : version antérieure SYNTHÉTIQUE, dérivée de l'extrait pour les tests
// d'historisation (un code en moins, et le tarif de 2381242 pas encore modifié).

const RACINE = path.join(import.meta.dirname, '../../..');
const SOURCE = path.join(RACINE, 'docs/ref/lpp/908');
const CIBLE = path.join(RACINE, 'fixtures/lpp');

const CODE_RETIRE_DE_907 = '7322675';
const CODE_TARIF_MODIFIE = '2381242';
const FIN_TARIF_MODIFIE = '20260702';
const DEBUT_NOUVEAU_TARIF = '20260703';

const CODES = [
  // Aides auditives : les 8 génériques, leur déclinaison SIVANTOS, et d'autres fabricants.
  ...['2351057', '2365119', '2392530', '2341840', '2325120', '2337749', '2307926', '2369117'],
  ...['7336200', '7336230', '7379971', '7336186', '7336246', '7336223', '7336163', '7336140'],
  ...['7330551', '7322675', '7310790', '7340093'],
  // Piles, entretien, suivi.
  ...['2332976', '2356882', '2356907', '2317149', '7397621', '7310778', '2357338', '2344100'],
  '2305927',
  // Plusieurs lignes d'historique ; tarif modifié le 03/07/2026.
  CODE_TARIF_MODIFIE,
  '2388474',
  // Paire d'incompatibilité du chapitre.
  ...['2325090', '2326941'],
  // Clos : ancienne classe, liste nominative close dans la fiche mais ouverte dans l'historique.
  ...['2351548', '2332901'],
  // Hors chapitre : optique, implant cochléaire.
  ...['7214164', '3400869'],
];

interface Dbf {
  readonly octets: Buffer;
  readonly champs: readonly ChampDbf[];
  readonly tailleEnTete: number;
  readonly tailleLigne: number;
}

async function charger(nom: string): Promise<Dbf> {
  const octets = await readFile(path.join(SOURCE, nom));
  const { champs } = lireDbf(octets);
  return {
    octets,
    champs,
    tailleEnTete: octets.readUInt16LE(8),
    tailleLigne: octets.readUInt16LE(10),
  };
}

function positionChamp(dbf: Dbf, nom: string): { debut: number; longueur: number } {
  let debut = 1;
  for (const champ of dbf.champs) {
    if (champ.nom === nom) {
      return { debut, longueur: champ.longueur };
    }
    debut += champ.longueur;
  }
  throw new Error(`Champ inconnu : ${nom}`);
}

function enregistrements(dbf: Dbf): Buffer[] {
  const nombre = dbf.octets.readUInt32LE(4);
  return Array.from({ length: nombre }, (_, i) => {
    const debut = dbf.tailleEnTete + i * dbf.tailleLigne;
    return Buffer.from(dbf.octets.subarray(debut, debut + dbf.tailleLigne));
  });
}

function champ(dbf: Dbf, ligne: Buffer, nom: string): string {
  const { debut, longueur } = positionChamp(dbf, nom);
  return ligne.toString('latin1', debut, debut + longueur).trim();
}

function ecrire(dbf: Dbf, lignes: readonly Buffer[]): Buffer {
  const enTete = Buffer.from(dbf.octets.subarray(0, dbf.tailleEnTete));
  enTete.writeUInt32LE(lignes.length, 4);
  return Buffer.concat([enTete, ...lignes, Buffer.from([0x1a])]);
}

async function sortie(version: string, type: string, contenu: Buffer): Promise<void> {
  await writeFile(path.join(CIBLE, version, `lpp_${type}_tot${version}.dbf`), contenu);
}

const fiche = await charger('lpp_fiche_tot908.dbf');
const histo = await charger('lpp_histo_tot908.dbf');
const comp = await charger('lpp_comp_tot908.dbf');
const incomp = await charger('lpp_incomp_tot908.dbf');

const codes = new Set(CODES);
const lignesFiche = enregistrements(fiche).filter((l) => codes.has(champ(fiche, l, 'CODE_TIPS')));
const lignesHisto = enregistrements(histo).filter((l) => codes.has(champ(histo, l, 'CODE_TIPS')));
if (lignesFiche.length !== codes.size) {
  throw new Error(`${codes.size - lignesFiche.length} code(s) absent(s) de la fiche.`);
}
const lignesComp = enregistrements(comp).slice(0, 3);
const lignesIncomp = [
  ...enregistrements(incomp).slice(0, 3),
  ...enregistrements(incomp).filter((l) => codes.has(champ(incomp, l, 'CODE1'))),
];

await rm(path.join(CIBLE, '908'), { recursive: true, force: true });
await rm(path.join(CIBLE, '907'), { recursive: true, force: true });
await mkdir(path.join(CIBLE, '908'), { recursive: true });
await mkdir(path.join(CIBLE, '907'), { recursive: true });

await sortie('908', 'fiche', ecrire(fiche, lignesFiche));
await sortie('908', 'histo', ecrire(histo, lignesHisto));
await sortie('908', 'comp', ecrire(comp, lignesComp));
await sortie('908', 'incomp', ecrire(incomp, lignesIncomp));

const { debut: debutFin, longueur: longueurFin } = positionChamp(histo, 'FINHISTO');
const histo907 = lignesHisto
  .filter((l) => champ(histo, l, 'CODE_TIPS') !== CODE_RETIRE_DE_907)
  .filter(
    (l) =>
      champ(histo, l, 'CODE_TIPS') !== CODE_TARIF_MODIFIE ||
      champ(histo, l, 'DEBUTVALID') !== DEBUT_NOUVEAU_TARIF,
  )
  .map((l) => {
    const copie = Buffer.from(l);
    if (
      champ(histo, l, 'CODE_TIPS') === CODE_TARIF_MODIFIE &&
      champ(histo, l, 'FINHISTO') === FIN_TARIF_MODIFIE
    ) {
      copie.fill(0x20, debutFin, debutFin + longueurFin);
    }
    return copie;
  });

await sortie(
  '907',
  'fiche',
  ecrire(
    fiche,
    lignesFiche.filter((l) => champ(fiche, l, 'CODE_TIPS') !== CODE_RETIRE_DE_907),
  ),
);
await sortie('907', 'histo', ecrire(histo, histo907));
await sortie('907', 'comp', ecrire(comp, lignesComp));
await sortie('907', 'incomp', ecrire(incomp, lignesIncomp));

console.log(
  `Fixtures écrites : ${lignesFiche.length} codes, ${lignesHisto.length} lignes d'historique.`,
);
