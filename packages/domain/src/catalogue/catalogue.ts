import { z } from 'zod';

import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { codeLppSchema } from '../lpp/lignes';
import { centimesDepuisSaisieEuros } from '../money';

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

export const fabricantSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
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
  actif: z.boolean(),
});
export type ModeleSaisie = z.infer<typeof modeleSaisieSchema>;

export const accessoireSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
  nature: z.enum(NATURES_ACCESSOIRE, { error: 'Choisir une nature.' }),
  codeLpp: codeLppOptionnelSchema,
  prixCentimes: prixSchema,
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
    actif: l.actif,
  }));

export const ENTETES_CSV_ACCESSOIRES = ['nom', 'nature', 'code_lpp', 'prix', 'actif'] as const;

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
    actif: actifCsvSchema,
  })
  .transform((l) => ({
    nom: l.nom,
    nature: l.nature,
    codeLpp: l.code_lpp,
    prixCentimes: l.prix,
    actif: l.actif,
  }));
