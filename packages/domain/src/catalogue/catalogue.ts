import { z } from 'zod';

import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { codeLppSchema } from '../lpp/lignes';
import { centimesDepuisSaisieEuros } from '../money';
import { prixAchatSchema } from '../stock/saisie';

export const TYPES_AIDE_AUDITIVE = ['CONTOUR', 'INTRA', 'RIC'] as const;
export type TypeAideAuditive = (typeof TYPES_AIDE_AUDITIVE)[number];

export const LIBELLES_TYPES_AIDE_AUDITIVE: Readonly<Record<TypeAideAuditive, string>> = {
  CONTOUR: 'Contour',
  INTRA: 'Intra',
  RIC: 'RIC',
};

export const CLASSES_LPP = ['CLASSE_I', 'CLASSE_II'] as const;
export type ClasseLpp = (typeof CLASSES_LPP)[number];

export const LIBELLES_CLASSES_LPP: Readonly<Record<ClasseLpp, string>> = {
  CLASSE_I: 'Classe I',
  CLASSE_II: 'Classe II',
};

export const NATURES_ACCESSOIRE = ['ACCESSOIRE', 'PILE'] as const;
export type NatureAccessoire = (typeof NATURES_ACCESSOIRE)[number];

export const LIBELLES_NATURES_ACCESSOIRE: Readonly<Record<NatureAccessoire, string>> = {
  ACCESSOIRE: 'Accessoire',
  PILE: 'Piles',
};

export const LIEUX_FABRICATION = ['UE', 'HORS_UE'] as const;
export type LieuFabrication = (typeof LIEUX_FABRICATION)[number];

export const LIBELLES_LIEUX_FABRICATION: Readonly<Record<LieuFabrication, string>> = {
  UE: 'UE',
  HORS_UE: 'hors UE',
};

/**
 * Options d'une aide auditive parmi lesquelles l'offre 100 % santé en compte au moins 3.
 * Source : modele-devis-audio.pdf p. 1 § 1.1.
 */
export const OPTIONS_AIDE_AUDITIVE = [
  'REDUCTEUR_ACOUPHENE',
  'CONNECTIVITE_SANS_FIL',
  'REDUCTEUR_BRUIT_VENT',
  'SYNCHRONISATION_BINAURALE',
  'DIRECTIVITE_ADAPTATIVE',
  'BANDE_PASSANTE_ELARGIE',
  'APPRENTISSAGE_SONIE',
  'REDUCTEUR_REVERBERATION',
] as const;
export type OptionAideAuditive = (typeof OPTIONS_AIDE_AUDITIVE)[number];

export const LIBELLES_OPTIONS_AIDE_AUDITIVE: Readonly<Record<OptionAideAuditive, string>> = {
  REDUCTEUR_ACOUPHENE: 'Réducteur d’acouphène',
  CONNECTIVITE_SANS_FIL: 'Connectivité sans fil',
  REDUCTEUR_BRUIT_VENT: 'Réducteur de bruit du vent',
  SYNCHRONISATION_BINAURALE: 'Synchronisation binaurale',
  DIRECTIVITE_ADAPTATIVE: 'Directivité microphonique adaptative',
  BANDE_PASSANTE_ELARGIE: 'Bande passante élargie ≥ 6 000 Hz',
  APPRENTISSAGE_SONIE: 'Apprentissage de sonie',
  REDUCTEUR_REVERBERATION: 'Réducteur de réverbération',
};

const prixSchema = z
  .string({ error: 'Le prix est obligatoire.' })
  .transform((saisie, ctx) => {
    const prix = centimesDepuisSaisieEuros(saisie);
    if (prix === null) {
      ctx.addIssue({ code: 'custom', message: 'Prix invalide (exemple : 1 490,00).' });
      return z.NEVER;
    }
    return prix;
  })
  .pipe(z.number());

/** Saisie d'une liste de codes (séparateurs : espace, virgule, point-virgule, barre verticale). */
const codesLppSchema = z
  .string()
  .transform((saisie) => [...new Set(saisie.split(/[\s,;|]+/).filter((code) => code !== ''))])
  .pipe(z.array(codeLppSchema));

const codeLppOptionnelSchema = texteOptionnelSchema.pipe(codeLppSchema.nullable());

/** Oui ou non du catalogue : une saisie vide reste inconnue, et bloquera le devis. */
const ouiNonOptionnelSchema = texteOptionnelSchema
  .transform((valeur) => valeur?.toLowerCase() ?? null)
  .pipe(z.enum(['oui', 'non'], { error: 'Indiquer oui ou non.' }).nullable())
  .transform((valeur) => (valeur === null ? null : valeur === 'oui'));

const nombreCanauxSchema = texteOptionnelSchema
  .pipe(
    z
      .string()
      .regex(/^[1-9]\d{0,2}$/, 'Nombre de canaux invalide.')
      .nullable(),
  )
  .transform((valeur) => (valeur === null ? null : Number(valeur)));

const lieuFabricationSchema = texteOptionnelSchema
  .transform((valeur) => valeur?.toUpperCase().replace(/[\s-]+/g, '_') ?? null)
  .pipe(z.enum(LIEUX_FABRICATION, { error: 'Lieu attendu : UE ou hors UE.' }).nullable());

/** Saisie d'une liste d'options (séparateurs : virgule, point-virgule, barre verticale). */
const optionsSchema = z
  .string()
  .default('')
  .transform((saisie) => [
    ...new Set(
      saisie
        .split(/[\s,;|]+/)
        .filter((option) => option !== '')
        .map((option) => option.toUpperCase()),
    ),
  ])
  .pipe(z.array(z.enum(OPTIONS_AIDE_AUDITIVE, { error: 'Option inconnue.' })));

export const fabricantSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
  adresse: texteOptionnelSchema,
  mandataire: texteOptionnelSchema,
  actif: z.boolean(),
});
export type FabricantSaisie = z.infer<typeof fabricantSaisieSchema>;

export const modeleSaisieSchema = z.object({
  fabricantId: z.string({ error: 'Choisir un fabricant.' }).min(1, 'Choisir un fabricant.'),
  gamme: texteObligatoire('La gamme est obligatoire.'),
  nom: texteObligatoire('Le nom du modèle est obligatoire.'),
  type: z.enum(TYPES_AIDE_AUDITIVE, { error: 'Choisir un type.' }),
  classe: z.enum(CLASSES_LPP, { error: 'Choisir une classe.' }),
  codesLpp: codesLppSchema,
  prixConseilleCentimes: prixSchema,
  marque: texteOptionnelSchema,
  referenceCommerciale: texteOptionnelSchema,
  lieuFabrication: lieuFabricationSchema,
  nombreCanaux: nombreCanauxSchema,
  connectivite: texteOptionnelSchema,
  antiLarsen: ouiNonOptionnelSchema,
  reducteurAcouphenes: ouiNonOptionnelSchema,
  bobineT: ouiNonOptionnelSchema,
  options: optionsSchema,
  actif: z.boolean(),
});
export type ModeleSaisie = z.infer<typeof modeleSaisieSchema>;

export const accessoireSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
  nature: z.enum(NATURES_ACCESSOIRE, { error: 'Choisir une nature.' }),
  codeLpp: codeLppOptionnelSchema,
  prixCentimes: prixSchema,
  prixAchatCentimes: prixAchatSchema,
  marque: texteOptionnelSchema,
  referenceCommerciale: texteOptionnelSchema,
  actif: z.boolean(),
});
export type AccessoireSaisie = z.infer<typeof accessoireSaisieSchema>;

// Import CSV : mêmes champs que les formulaires, valeurs lisibles dans un tableur.

const actifCsvSchema = z
  .string()
  .transform((valeur) => valeur.toLowerCase())
  .pipe(z.enum(['oui', 'non'], { error: 'Indiquer oui ou non.' }))
  .transform((valeur) => valeur === 'oui');

const VALEURS_CLASSE_CSV: Readonly<Record<string, ClasseLpp>> = {
  I: 'CLASSE_I',
  II: 'CLASSE_II',
};

export const ENTETES_CSV_MODELES = [
  'fabricant',
  'gamme',
  'nom',
  'type',
  'classe',
  'codes_lpp',
  'prix_conseille',
  'marque',
  'reference_commerciale',
  'lieu_fabrication',
  'nombre_canaux',
  'connectivite',
  'anti_larsen',
  'reducteur_acouphenes',
  'bobine_t',
  'options',
  'actif',
] as const;

/** Ligne d'import des modèles. Le fabricant est donné par son nom et résolu par le service. */
export const ligneCsvModeleSchema = z
  .object({
    fabricant: texteObligatoire('Le fabricant est obligatoire.'),
    gamme: texteObligatoire('La gamme est obligatoire.'),
    nom: texteObligatoire('Le nom du modèle est obligatoire.'),
    type: z
      .string()
      .transform((valeur) => valeur.toUpperCase())
      .pipe(z.enum(TYPES_AIDE_AUDITIVE, { error: 'Type attendu : contour, intra ou RIC.' })),
    classe: z
      .string()
      .transform((valeur) => VALEURS_CLASSE_CSV[valeur.toUpperCase()])
      .pipe(z.enum(CLASSES_LPP, { error: 'Classe attendue : I ou II.' })),
    codes_lpp: codesLppSchema,
    prix_conseille: prixSchema,
    marque: texteOptionnelSchema,
    reference_commerciale: texteOptionnelSchema,
    lieu_fabrication: lieuFabricationSchema,
    nombre_canaux: nombreCanauxSchema,
    connectivite: texteOptionnelSchema,
    anti_larsen: ouiNonOptionnelSchema,
    reducteur_acouphenes: ouiNonOptionnelSchema,
    bobine_t: ouiNonOptionnelSchema,
    options: optionsSchema,
    actif: actifCsvSchema,
  })
  .transform((l) => ({
    fabricant: l.fabricant,
    gamme: l.gamme,
    nom: l.nom,
    type: l.type,
    classe: l.classe,
    codesLpp: l.codes_lpp,
    prixConseilleCentimes: l.prix_conseille,
    marque: l.marque,
    referenceCommerciale: l.reference_commerciale,
    lieuFabrication: l.lieu_fabrication,
    nombreCanaux: l.nombre_canaux,
    connectivite: l.connectivite,
    antiLarsen: l.anti_larsen,
    reducteurAcouphenes: l.reducteur_acouphenes,
    bobineT: l.bobine_t,
    options: l.options,
    actif: l.actif,
  }));

export const ENTETES_CSV_ACCESSOIRES = [
  'nom',
  'nature',
  'code_lpp',
  'prix',
  'marque',
  'reference_commerciale',
  'actif',
] as const;

const VALEURS_NATURE_CSV: Readonly<Record<string, NatureAccessoire>> = {
  ACCESSOIRE: 'ACCESSOIRE',
  PILE: 'PILE',
  PILES: 'PILE',
};

export const ligneCsvAccessoireSchema = z
  .object({
    nom: texteObligatoire('Le nom est obligatoire.'),
    nature: z
      .string()
      .transform((valeur) => VALEURS_NATURE_CSV[valeur.toUpperCase()])
      .pipe(z.enum(NATURES_ACCESSOIRE, { error: 'Nature attendue : accessoire ou piles.' })),
    code_lpp: codeLppOptionnelSchema,
    prix: prixSchema,
    marque: texteOptionnelSchema,
    reference_commerciale: texteOptionnelSchema,
    actif: actifCsvSchema,
  })
  .transform((l) => ({
    nom: l.nom,
    nature: l.nature,
    codeLpp: l.code_lpp,
    prixCentimes: l.prix,
    marque: l.marque,
    referenceCommerciale: l.reference_commerciale,
    actif: l.actif,
  }));
