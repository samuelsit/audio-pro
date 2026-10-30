import { z } from 'zod';

import { pageSchema } from '../commun/pagination';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { normaliserPourRecherche } from '../patient/recherche';
import { rppsOptionnelSchema } from '../praticien/identifiants';

export const SPECIALITES_PRESCRIPTEUR = ['ORL', 'MEDECIN_GENERALISTE', 'AUTRE'] as const;
export type SpecialitePrescripteur = (typeof SPECIALITES_PRESCRIPTEUR)[number];

export const LIBELLES_SPECIALITES_PRESCRIPTEUR: Readonly<Record<SpecialitePrescripteur, string>> = {
  ORL: 'ORL',
  MEDECIN_GENERALISTE: 'Médecin généraliste',
  AUTRE: 'Autre',
};

/** La formation en otologie médicale ne concerne que les médecins généralistes. */
export function formationOtologieConcernee(specialite: SpecialitePrescripteur): boolean {
  return specialite === 'MEDECIN_GENERALISTE';
}

const formationSchema = z
  .enum(['oui', 'non', ''])
  .default('')
  .transform((valeur) => (valeur === '' ? null : valeur === 'oui'));

/**
 * Fiche prescripteur. Le RPPS reste facultatif pour permettre la création à la volée (ADR-008).
 * L'éligibilité à prescrire n'est pas contrôlée ici : voir `prescriptionValide`.
 */
export const prescripteurSaisieSchema = z
  .object({
    nom: texteObligatoire('Le nom est obligatoire.'),
    prenom: texteObligatoire('Le prénom est obligatoire.'),
    rpps: rppsOptionnelSchema,
    specialite: z.enum(SPECIALITES_PRESCRIPTEUR, { error: 'Choisir une spécialité.' }),
    formationOtologie: formationSchema,
    cabinet: texteOptionnelSchema,
    contact: texteOptionnelSchema.pipe(z.email('Adresse e-mail ou MSSanté invalide.').nullable()),
  })
  .superRefine((p, ctx) => {
    if (formationOtologieConcernee(p.specialite) && p.formationOtologie === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['formationOtologie'],
        message: 'Préciser la formation en otologie médicale.',
      });
    }
  })
  .transform((p) => ({
    ...p,
    formationOtologie: formationOtologieConcernee(p.specialite) ? p.formationOtologie : null,
  }));
export type PrescripteurSaisie = z.output<typeof prescripteurSaisieSchema>;

/** Recherche rapide : un texte libre (nom, prénom, RPPS), mots dans n'importe quel ordre. */
export const criteresRecherchePrescripteurSchema = z.object({
  q: z
    .string()
    .optional()
    .catch(undefined)
    .transform((valeur) => normaliserPourRecherche(valeur ?? '').slice(0, 100)),
  page: pageSchema,
});
export type CriteresRecherchePrescripteur = z.output<typeof criteresRecherchePrescripteurSchema>;

export function motsDeRecherche(texteNormalise: string): string[] {
  return texteNormalise.split(' ').filter((mot) => mot !== '');
}
