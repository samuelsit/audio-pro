import type { Prisma } from '@ha/db';
import {
  accessoireSaisieSchema,
  differencesAuditees,
  ENTETES_CSV_ACCESSOIRES,
  ENTETES_CSV_MODELES,
  fabricantSaisieSchema,
  interpreterCsv,
  ligneCsvAccessoireSchema,
  ligneCsvModeleSchema,
  modeleSaisieSchema,
  type AccessoireSaisie,
  type ClasseLpp,
  type LieuFabrication,
  type ErreurLigneCsv,
  type ModeleSaisie,
  type NatureAccessoire,
  type OptionAideAuditive,
  type TypeAideAuditive,
} from '@ha/domain';

import { AccesRefuseError, verifierRole, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { codesLppInconnus } from './lpp';

export const TAILLE_MAX_CSV = 1024 * 1024;

export interface FabricantResume {
  id: string;
  nom: string;
  adresse: string | null;
  mandataire: string | null;
  actif: boolean;
}

export interface ModeleResume {
  id: string;
  fabricantId: string;
  fabricant: string;
  gamme: string;
  nom: string;
  type: TypeAideAuditive;
  classe: ClasseLpp;
  codesLpp: string[];
  prixConseilleCentimes: number;
  marque: string | null;
  referenceCommerciale: string | null;
  lieuFabrication: LieuFabrication | null;
  nombreCanaux: number | null;
  connectivite: string | null;
  antiLarsen: boolean | null;
  reducteurAcouphenes: boolean | null;
  bobineT: boolean | null;
  options: OptionAideAuditive[];
  actif: boolean;
}

export interface AccessoireResume {
  id: string;
  nom: string;
  nature: NatureAccessoire;
  codeLpp: string | null;
  prixCentimes: number;
  marque: string | null;
  referenceCommerciale: string | null;
  actif: boolean;
}

/** Bilan d'un import CSV réussi. Si une ligne est refusée, rien n'est écrit. */
export interface BilanImportCsv {
  crees: number;
  modifies: number;
}

/** Refus d'un import CSV : la liste des erreurs, ligne par ligne. */
export class ErreurImportCsv extends Error {
  constructor(readonly erreurs: readonly ErreurLigneCsv[]) {
    super('Le fichier contient des erreurs : aucune ligne n’a été importée.');
    this.name = 'ErreurImportCsv';
  }
}

async function verifierCodes(codes: readonly string[], champ: string): Promise<void> {
  const inconnus = await codesLppInconnus(codes);
  if (inconnus.length > 0) {
    throw ErreurSaisie.surChamp(champ, `Code(s) LPP inconnu(s) : ${inconnus.join(', ')}.`);
  }
}

// --- Fabricants ---------------------------------------------------------------------------------

const DOUBLON_FABRICANT = {
  fabricant_organisation_id_nom_key: ['nom', 'Ce fabricant existe déjà.'],
} as const;

const selectionFabricant = {
  id: true,
  nom: true,
  adresse: true,
  mandataire: true,
  actif: true,
} as const;

export async function listerFabricants(acteur: UtilisateurConnecte): Promise<FabricantResume[]> {
  return base(acteur).fabricant.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { actif: true }),
    },
    select: selectionFabricant,
    orderBy: { nom: 'asc' },
  });
}

export async function obtenirFabricant(
  acteur: UtilisateurConnecte,
  fabricantId: string,
): Promise<FabricantResume> {
  const f = await base(acteur).fabricant.findFirst({
    where: { id: fabricantId, organisationId: acteur.organisationId },
    select: selectionFabricant,
  });
  if (!f) {
    throw new AccesRefuseError();
  }
  return f;
}

export async function creerFabricant(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const donnees = valider(fabricantSaisieSchema, saisie);
  try {
    const f = await withAudit(
      acteur,
      (tx) =>
        tx.fabricant.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'FABRICANT',
        entiteId: cree.id,
        champs: differencesAuditees('FABRICANT', null, donnees),
      }),
    );
    return f.id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_FABRICANT, 'Ce fabricant existe déjà.');
  }
}

export async function modifierFabricant(
  acteur: UtilisateurConnecte,
  fabricantId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const actuel = await obtenirFabricant(acteur, fabricantId);
  const donnees = valider(fabricantSaisieSchema, saisie);
  try {
    await withAudit(
      acteur,
      (tx) => tx.fabricant.update({ where: { id: fabricantId }, data: donnees }),
      {
        action: 'UPDATE',
        entiteType: 'FABRICANT',
        entiteId: fabricantId,
        champs: differencesAuditees(
          'FABRICANT',
          {
            nom: actuel.nom,
            adresse: actuel.adresse,
            mandataire: actuel.mandataire,
            actif: actuel.actif,
          },
          donnees,
        ),
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_FABRICANT, 'Ce fabricant existe déjà.');
  }
}

// --- Modèles ------------------------------------------------------------------------------------

const selectionModele = {
  id: true,
  fabricantId: true,
  fabricant: { select: { nom: true } },
  gamme: true,
  nom: true,
  type: true,
  classe: true,
  prixConseilleCentimes: true,
  marque: true,
  referenceCommerciale: true,
  lieuFabrication: true,
  nombreCanaux: true,
  connectivite: true,
  antiLarsen: true,
  reducteurAcouphenes: true,
  bobineT: true,
  options: true,
  actif: true,
  codesLpp: { select: { code: true }, orderBy: { code: 'asc' } },
} as const;

type LigneModele = Prisma.ModeleAideAuditiveGetPayload<{ select: typeof selectionModele }>;

function versModele(m: LigneModele): ModeleResume {
  return { ...m, fabricant: m.fabricant.nom, codesLpp: m.codesLpp.map((c) => c.code) };
}

const DOUBLON_MODELE = {
  modele_aide_auditive_fabricant_id_gamme_nom_key: [
    'nom',
    'Ce modèle existe déjà dans cette gamme.',
  ],
} as const;

export async function listerModeles(acteur: UtilisateurConnecte): Promise<ModeleResume[]> {
  const lignes = await base(acteur).modeleAideAuditive.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { actif: true }),
    },
    select: selectionModele,
    orderBy: [{ fabricant: { nom: 'asc' } }, { gamme: 'asc' }, { nom: 'asc' }],
  });
  return lignes.map(versModele);
}

export async function obtenirModele(
  acteur: UtilisateurConnecte,
  modeleId: string,
): Promise<ModeleResume> {
  const m = await base(acteur).modeleAideAuditive.findFirst({
    where: { id: modeleId, organisationId: acteur.organisationId },
    select: selectionModele,
  });
  if (!m) {
    throw new AccesRefuseError();
  }
  return versModele(m);
}

async function validerModele(acteur: UtilisateurConnecte, saisie: unknown): Promise<ModeleSaisie> {
  const donnees = valider(modeleSaisieSchema, saisie);
  const fabricant = await base(acteur).fabricant.findFirst({
    where: { id: donnees.fabricantId, organisationId: acteur.organisationId },
    select: { id: true },
  });
  if (!fabricant) {
    throw ErreurSaisie.surChamp('fabricantId', 'Fabricant inconnu.');
  }
  await verifierCodes(donnees.codesLpp, 'codesLpp');
  return donnees;
}

export async function creerModele(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const { codesLpp, ...donnees } = await validerModele(acteur, saisie);
  try {
    const m = await withAudit(
      acteur,
      (tx) =>
        tx.modeleAideAuditive.create({
          data: {
            ...donnees,
            organisationId: acteur.organisationId,
            codesLpp: { create: codesLpp.map((code) => ({ code })) },
          },
          select: { id: true },
        }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'MODELE_AIDE_AUDITIVE',
        entiteId: cree.id,
        champs: differencesAuditees('MODELE_AIDE_AUDITIVE', null, { ...donnees, codesLpp }),
      }),
    );
    return m.id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_MODELE, 'Ce modèle existe déjà.');
  }
}

async function remplacerCodes(
  tx: ClientTransaction,
  modeleId: string,
  codes: readonly string[],
): Promise<void> {
  await tx.modeleCodeLpp.deleteMany({ where: { modeleId, code: { notIn: [...codes] } } });
  await tx.modeleCodeLpp.createMany({
    data: codes.map((code) => ({ modeleId, code })),
    skipDuplicates: true,
  });
}

export async function modifierModele(
  acteur: UtilisateurConnecte,
  modeleId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const actuel = await obtenirModele(acteur, modeleId);
  const { codesLpp, ...donnees } = await validerModele(acteur, saisie);
  if (donnees.fabricantId !== actuel.fabricantId) {
    const appareils = await base(acteur).appareil.count({ where: { modeleId } });
    if (appareils > 0) {
      throw ErreurSaisie.surChamp(
        'fabricantId',
        'Des appareils de ce modèle sont en stock : son fabricant ne peut plus changer.',
      );
    }
  }
  try {
    await withAudit(
      acteur,
      async (tx) => {
        await tx.modeleAideAuditive.update({ where: { id: modeleId }, data: donnees });
        await remplacerCodes(tx, modeleId, codesLpp);
      },
      {
        action: 'UPDATE',
        entiteType: 'MODELE_AIDE_AUDITIVE',
        entiteId: modeleId,
        champs: differencesAuditees(
          'MODELE_AIDE_AUDITIVE',
          {
            fabricantId: actuel.fabricantId,
            gamme: actuel.gamme,
            nom: actuel.nom,
            type: actuel.type,
            classe: actuel.classe,
            codesLpp: actuel.codesLpp,
            prixConseilleCentimes: actuel.prixConseilleCentimes,
            marque: actuel.marque,
            referenceCommerciale: actuel.referenceCommerciale,
            lieuFabrication: actuel.lieuFabrication,
            nombreCanaux: actuel.nombreCanaux,
            connectivite: actuel.connectivite,
            antiLarsen: actuel.antiLarsen,
            reducteurAcouphenes: actuel.reducteurAcouphenes,
            bobineT: actuel.bobineT,
            options: actuel.options,
            actif: actuel.actif,
          },
          { ...donnees, codesLpp },
        ),
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_MODELE, 'Ce modèle existe déjà.');
  }
}

// --- Accessoires et piles -----------------------------------------------------------------------

const selectionAccessoire = {
  id: true,
  nom: true,
  nature: true,
  codeLpp: true,
  prixCentimes: true,
  marque: true,
  referenceCommerciale: true,
  actif: true,
} as const;

const DOUBLON_ACCESSOIRE = {
  accessoire_organisation_id_nom_key: ['nom', 'Cet accessoire existe déjà.'],
} as const;

export async function listerAccessoires(acteur: UtilisateurConnecte): Promise<AccessoireResume[]> {
  return base(acteur).accessoire.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { actif: true }),
    },
    select: selectionAccessoire,
    orderBy: [{ nature: 'asc' }, { nom: 'asc' }],
  });
}

export async function obtenirAccessoire(
  acteur: UtilisateurConnecte,
  accessoireId: string,
): Promise<AccessoireResume> {
  const a = await base(acteur).accessoire.findFirst({
    where: { id: accessoireId, organisationId: acteur.organisationId },
    select: selectionAccessoire,
  });
  if (!a) {
    throw new AccesRefuseError();
  }
  return a;
}

async function validerAccessoire(saisie: unknown): Promise<AccessoireSaisie> {
  const donnees = valider(accessoireSaisieSchema, saisie);
  await verifierCodes(donnees.codeLpp === null ? [] : [donnees.codeLpp], 'codeLpp');
  return donnees;
}

export async function creerAccessoire(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const donnees = await validerAccessoire(saisie);
  try {
    const a = await withAudit(
      acteur,
      (tx) =>
        tx.accessoire.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'ACCESSOIRE',
        entiteId: cree.id,
        champs: differencesAuditees('ACCESSOIRE', null, donnees),
      }),
    );
    return a.id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_ACCESSOIRE, 'Cet accessoire existe déjà.');
  }
}

export async function modifierAccessoire(
  acteur: UtilisateurConnecte,
  accessoireId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const actuel = await obtenirAccessoire(acteur, accessoireId);
  const donnees = await validerAccessoire(saisie);
  try {
    await withAudit(
      acteur,
      (tx) => tx.accessoire.update({ where: { id: accessoireId }, data: donnees }),
      {
        action: 'UPDATE',
        entiteType: 'ACCESSOIRE',
        entiteId: accessoireId,
        champs: differencesAuditees(
          'ACCESSOIRE',
          {
            nom: actuel.nom,
            nature: actuel.nature,
            codeLpp: actuel.codeLpp,
            prixCentimes: actuel.prixCentimes,
            marque: actuel.marque,
            referenceCommerciale: actuel.referenceCommerciale,
            actif: actuel.actif,
          },
          donnees,
        ),
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_ACCESSOIRE, 'Cet accessoire existe déjà.');
  }
}

// --- Import CSV : tout ou rien ------------------------------------------------------------------

function exigerSansErreur<T>(resultat: {
  lignes: readonly { ligne: number; valeur: T }[];
  erreurs: readonly ErreurLigneCsv[];
}) {
  if (resultat.erreurs.length > 0) {
    throw new ErreurImportCsv(resultat.erreurs);
  }
  return resultat.lignes;
}

function trierErreurs(erreurs: readonly ErreurLigneCsv[]): ErreurLigneCsv[] {
  return [...erreurs].sort((a, b) => a.ligne - b.ligne);
}

function doublonsDansLeFichier<T>(
  lignes: readonly { ligne: number; valeur: T }[],
  cle: (valeur: T) => string,
): ErreurLigneCsv[] {
  const vues = new Map<string, number>();
  const erreurs: ErreurLigneCsv[] = [];
  for (const { ligne, valeur } of lignes) {
    const premiere = vues.get(cle(valeur));
    if (premiere === undefined) {
      vues.set(cle(valeur), ligne);
    } else {
      erreurs.push({ ligne, message: `Même clé qu’à la ligne ${premiere}.` });
    }
  }
  return erreurs;
}

async function erreursCodes<T>(
  lignes: readonly { ligne: number; valeur: T }[],
  codes: (valeur: T) => readonly string[],
): Promise<ErreurLigneCsv[]> {
  const inconnus = new Set(
    await codesLppInconnus([...new Set(lignes.flatMap((l) => codes(l.valeur)))]),
  );
  return lignes.flatMap(({ ligne, valeur }) =>
    codes(valeur)
      .filter((code) => inconnus.has(code))
      .map((code) => ({ ligne, message: `Code LPP inconnu : ${code}.` })),
  );
}

export async function importerModelesCsv(
  acteur: UtilisateurConnecte,
  texte: string,
): Promise<BilanImportCsv> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const lignes = exigerSansErreur(interpreterCsv(texte, ENTETES_CSV_MODELES, ligneCsvModeleSchema));
  const fabricants = await base(acteur).fabricant.findMany({
    where: { organisationId: acteur.organisationId },
    select: { id: true, nom: true },
  });
  const idsFabricants = new Map(fabricants.map((f) => [f.nom, f.id]));
  const erreurs = [
    ...doublonsDansLeFichier(lignes, (v) => JSON.stringify([v.fabricant, v.gamme, v.nom])),
    ...lignes
      .filter((l) => !idsFabricants.has(l.valeur.fabricant))
      .map(({ ligne, valeur }) => ({
        ligne,
        message: `Fabricant inconnu : ${valeur.fabricant}.`,
      })),
    ...(await erreursCodes(lignes, (v) => v.codesLpp)),
  ];
  if (erreurs.length > 0) {
    throw new ErreurImportCsv(trierErreurs(erreurs));
  }

  let crees = 0;
  await withAudit(
    acteur,
    async (tx) => {
      for (const { valeur } of lignes) {
        const { fabricant, codesLpp, ...donnees } = valeur;
        const fabricantId = idsFabricants.get(fabricant) ?? '';
        const existant = await tx.modeleAideAuditive.findUnique({
          where: {
            fabricantId_gamme_nom: { fabricantId, gamme: donnees.gamme, nom: donnees.nom },
          },
          select: { id: true },
        });
        if (existant) {
          await tx.modeleAideAuditive.update({ where: { id: existant.id }, data: donnees });
          await remplacerCodes(tx, existant.id, codesLpp);
        } else {
          crees += 1;
          await tx.modeleAideAuditive.create({
            data: {
              ...donnees,
              fabricantId,
              organisationId: acteur.organisationId,
              codesLpp: { create: codesLpp.map((code) => ({ code })) },
            },
          });
        }
      }
    },
    () => ({
      action: 'CREATE',
      entiteType: 'MODELE_AIDE_AUDITIVE',
      details: { importCsv: true, lignes: lignes.length, crees },
    }),
  );
  return { crees, modifies: lignes.length - crees };
}

export async function importerAccessoiresCsv(
  acteur: UtilisateurConnecte,
  texte: string,
): Promise<BilanImportCsv> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const lignes = exigerSansErreur(
    interpreterCsv(texte, ENTETES_CSV_ACCESSOIRES, ligneCsvAccessoireSchema),
  );
  const erreurs = [
    ...doublonsDansLeFichier(lignes, (v) => v.nom),
    ...(await erreursCodes(lignes, (v) => (v.codeLpp === null ? [] : [v.codeLpp]))),
  ];
  if (erreurs.length > 0) {
    throw new ErreurImportCsv(trierErreurs(erreurs));
  }

  let crees = 0;
  await withAudit(
    acteur,
    async (tx) => {
      for (const { valeur } of lignes) {
        const cle = { organisationId: acteur.organisationId, nom: valeur.nom };
        const existant = await tx.accessoire.findUnique({
          where: { organisationId_nom: cle },
          select: { id: true },
        });
        if (existant) {
          await tx.accessoire.update({ where: { id: existant.id }, data: valeur });
        } else {
          crees += 1;
          await tx.accessoire.create({
            data: { ...valeur, organisationId: acteur.organisationId },
          });
        }
      }
    },
    () => ({
      action: 'CREATE',
      entiteType: 'ACCESSOIRE',
      details: { importCsv: true, lignes: lignes.length, crees },
    }),
  );
  return { crees, modifies: lignes.length - crees };
}
