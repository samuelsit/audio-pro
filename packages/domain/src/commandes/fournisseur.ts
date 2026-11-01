import { z } from 'zod';

import { retirerEspaces, texteObligatoire, texteOptionnelSchema } from '../commun/texte';

export const TYPES_FOURNISSEUR = ['FABRICANT', 'FOURNISSEUR'] as const;
export type TypeFournisseur = (typeof TYPES_FOURNISSEUR)[number];

export const LIBELLES_TYPE_FOURNISSEUR: Readonly<Record<TypeFournisseur, string>> = {
  FABRICANT: 'Fabricant',
  FOURNISSEUR: 'Fournisseur',
};

const courrielOptionnelSchema = texteOptionnelSchema.pipe(
  z.email('Adresse e-mail invalide.').max(200, '200 caractères au maximum.').nullable(),
);
const texteCourtOptionnelSchema = texteOptionnelSchema.pipe(
  z.string().max(100, '100 caractères au maximum.').nullable(),
);
const texteLongOptionnelSchema = texteOptionnelSchema.pipe(
  z.string().max(1000, '1000 caractères au maximum.').nullable(),
);
const idOptionnelSchema = texteOptionnelSchema.pipe(z.uuid('Sélection invalide.').nullable());

const delaiOptionnelSchema = texteOptionnelSchema.transform((saisie, ctx) => {
  if (saisie === null) {
    return null;
  }
  const delai = Number(saisie);
  if (!Number.isInteger(delai) || delai < 1 || delai > 90) {
    ctx.addIssue({ code: 'custom', message: 'Entre 1 et 90 jours.' });
    return z.NEVER;
  }
  return delai;
});

const siretOptionnelSchema = texteOptionnelSchema
  .transform((valeur) => (valeur === null ? null : retirerEspaces(valeur)))
  .pipe(
    z
      .string()
      .regex(/^\d{14}$/, 'Le SIRET compte 14 chiffres.')
      .nullable(),
  );

export const fournisseurSaisieSchema = z
  .object({
    type: z.enum(TYPES_FOURNISSEUR, { error: 'Choisir le type.' }),
    nom: texteObligatoire('Le nom est obligatoire.'),
    fabricantId: idOptionnelSchema,
    centraleAchatId: idOptionnelSchema,
    emailCommande: courrielOptionnelSchema,
    emailFacturation: courrielOptionnelSchema,
    telephone: texteOptionnelSchema.pipe(
      z.string().max(30, '30 caractères au maximum.').nullable(),
    ),
    adresse: texteOptionnelSchema.pipe(
      z.string().max(300, '300 caractères au maximum.').nullable(),
    ),
    siret: siretOptionnelSchema,
    conditions: texteLongOptionnelSchema,
    delaiRelanceJours: delaiOptionnelSchema,
    actif: z.boolean(),
  })
  .superRefine((saisie, ctx) => {
    if (saisie.type === 'FABRICANT' && saisie.fabricantId === null) {
      ctx.addIssue({ code: 'custom', path: ['fabricantId'], message: 'Choisir le fabricant.' });
    }
    if (saisie.type === 'FOURNISSEUR' && saisie.fabricantId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['fabricantId'],
        message: 'Un fournisseur n’a pas de fabricant.',
      });
    }
  });
export type FournisseurSaisie = z.output<typeof fournisseurSaisieSchema>;

export const contactFournisseurSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
  fonction: texteCourtOptionnelSchema,
  email: courrielOptionnelSchema,
  telephone: texteOptionnelSchema.pipe(z.string().max(30, '30 caractères au maximum.').nullable()),
});
export type ContactFournisseurSaisie = z.output<typeof contactFournisseurSaisieSchema>;

/** Un numéro vide retire le rattachement du centre. */
export const comptesCentresSaisieSchema = z.array(
  z.object({ centreId: z.uuid('Centre invalide.'), numeroClient: texteCourtOptionnelSchema }),
);
export type ComptesCentresSaisie = z.output<typeof comptesCentresSaisieSchema>;

export const centraleAchatSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
  email: courrielOptionnelSchema,
  telephone: texteOptionnelSchema.pipe(z.string().max(30, '30 caractères au maximum.').nullable()),
  adresse: texteOptionnelSchema.pipe(z.string().max(300, '300 caractères au maximum.').nullable()),
  actif: z.boolean(),
});
export type CentraleAchatSaisie = z.output<typeof centraleAchatSaisieSchema>;
