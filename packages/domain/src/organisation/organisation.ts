import { z } from 'zod';

import { emailSchema } from '../acces/utilisateur';
import { codePostalSchema } from '../centre/centre';
import { retirerEspaces, texteObligatoire, texteOptionnelSchema } from '../commun/texte';

export const STATUTS_ORGANISATION = ['ESSAI', 'ACTIF', 'SUSPENDU'] as const;
export type StatutOrganisation = (typeof STATUTS_ORGANISATION)[number];

export const LIBELLES_STATUTS_ORGANISATION: Readonly<Record<StatutOrganisation, string>> = {
  ESSAI: 'Essai',
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
};

/** Un client suspendu ne se connecte plus. `null` : compte éditeur, sans organisation. */
export function clientPeutSeConnecter(statut: StatutOrganisation | null): boolean {
  return statut !== 'SUSPENDU';
}

// À VÉRIFIER : la clé de contrôle du SIREN est absente de docs/ref ; seul le format est contrôlé.
export const sirenSchema = z
  .string({ error: 'Le SIREN est obligatoire.' })
  .transform(retirerEspaces)
  .pipe(z.string().regex(/^\d{9}$/, 'Le SIREN doit comporter 9 chiffres.'));

/** Statuts qu'un client peut prendre à sa création ou à sa réactivation. */
export const statutClientSchema = z.enum(['ESSAI', 'ACTIF'], { error: 'Statut inconnu.' });

/** Création d'un client depuis la console, avec le compte de son premier administrateur. */
export const organisationSaisieSchema = z.object({
  raisonSociale: texteObligatoire('La raison sociale est obligatoire.', 200),
  siren: sirenSchema,
  adresseLigne1: texteObligatoire('L’adresse est obligatoire.'),
  adresseLigne2: texteOptionnelSchema,
  codePostal: codePostalSchema,
  ville: texteObligatoire('La ville est obligatoire.', 100),
  statut: statutClientSchema,
  adminPrenom: texteObligatoire('Le prénom est obligatoire.', 100),
  adminNom: texteObligatoire('Le nom est obligatoire.', 100),
  adminEmail: emailSchema,
});
export type OrganisationSaisie = z.infer<typeof organisationSaisieSchema>;
