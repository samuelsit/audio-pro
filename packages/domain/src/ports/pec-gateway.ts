import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { STATUTS_PEC } from '../facture/saisie';

// Port de demande de prise en charge complémentaire auprès d'une plateforme de tiers payant.
//
// Structure provisoire, définie pour FakePecGateway à l'étape 16. Elle sera alignée à l'étape 28 sur la documentation
// des plateformes (docs/vendor/pec) : noms et formats des champs, statuts, codes de refus.
// À VÉRIFIER : docs/vendor/pec n'existe pas ; aucun champ ci-dessous ne vient d'une documentation fournisseur.
// Une demande ne porte ni NIR ni donnée médicale : l'étape 28 décidera de ce que la plateforme exige.

export const ligneDemandePecSchema = z.object({
  libelle: z.string().min(1),
  codeLpp: z.string().nullable(),
  prixTtcCentimes: z.number().int().nonnegative(),
  amoCentimes: z.number().int().nonnegative(),
  montantDemandeCentimes: z.number().int().nonnegative(),
});
export type LigneDemandePec = z.output<typeof ligneDemandePecSchema>;

export const demandePecSchema = z.object({
  dossierId: z.string().min(1),
  organismeIdentifiant: z.string().nullable(),
  organisme: z.string().min(1),
  numeroAdherent: z.string().nullable(),
  lignes: z.array(ligneDemandePecSchema).min(1),
});
export type DemandePec = z.output<typeof demandePecSchema>;

export const reponsePecSchema = z.object({
  reference: z.string().min(1),
  statut: z.enum(STATUTS_PEC),
  numeroAccord: z.string().nullable(),
  montantAccordeCentimes: z.number().int().nonnegative().nullable(),
  validiteFin: dateCalendaireSchema.nullable(),
  /** Motif d'un refus, `null` sinon. */
  motif: z.string().nullable(),
});
export type ReponsePec = z.output<typeof reponsePecSchema>;

export interface PecGateway {
  demander(demande: DemandePec): Promise<ReponsePec>;
  consulter(reference: string): Promise<ReponsePec>;
}
