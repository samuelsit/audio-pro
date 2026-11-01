import { z } from 'zod';

import type { CodeControle, Constat } from '../audio-rules/controles';
import type { LigneFacture } from './preparation';

/** Instantané du centre à la validation : la pièce ne suit plus les changements de la fiche. */
export const vendeurFactureSchema = z.object({
  raisonSociale: z.string().nullable(),
  nomCentre: z.string(),
  adresse: z.array(z.string()),
  telephone: z.string(),
  email: z.string(),
  siret: z.string().nullable(),
  rcs: z.string().nullable(),
  finess: z.string().nullable(),
  tvaIntracommunautaire: z.string().nullable(),
});
export type VendeurFacture = z.output<typeof vendeurFactureSchema>;

/** Instantané du patient à la validation. Ni NIR ni donnée de santé. */
export const clientFactureSchema = z.object({
  prenomNom: z.string(),
  adresse: z.array(z.string()),
});
export type ClientFacture = z.output<typeof clientFactureSchema>;

/** Source : modele-devis-audio.pdf p. 2 § 5 ; convention-audioprothesistes.pdf, art. 27, p. 26. */
export const MENTION_DELIVRANCE =
  'La date de facturation marque la délivrance de l’appareil auditif.';

/**
 * Mentions du vendeur, du client et des lignes.
 * Source : modele-devis-audio.pdf p. 2, identification de l'entreprise (SIRET, RCS, FINESS, TVA).
 * À VÉRIFIER : les mentions obligatoires d'une facture relèvent du code de commerce et du CGI, absents de
 * docs/ref. La raison sociale et le SIRET bloquent, comme au devis ; le reste est signalé (R27).
 */
export function controlerMentions(
  vendeur: VendeurFacture,
  client: ClientFacture,
  lignes: readonly LigneFacture[],
): { readonly erreurs: readonly Constat[]; readonly avertissements: readonly Constat[] } {
  const constat = (code: CodeControle): Constat => ({ code, oreille: null });
  const { raisonSociale, siret, rcs, finess, tvaIntracommunautaire } = vendeur;
  const erreurs = [
    ...(raisonSociale === null || siret === null
      ? [constat('IDENTIFICATION_ENTREPRISE_INCOMPLETE')]
      : []),
    ...(lignes.length === 0 ? [constat('AUCUNE_LIGNE_FACTURE')] : []),
  ];
  const avertissements = [
    ...(rcs === null || finess === null || tvaIntracommunautaire === null
      ? [constat('IDENTIFIANTS_ENTREPRISE_A_COMPLETER')]
      : []),
    ...(client.adresse.length === 0 ? [constat('ADRESSE_CLIENT_MANQUANTE')] : []),
  ];
  return { erreurs, avertissements };
}
