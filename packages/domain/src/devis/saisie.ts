import { z } from 'zod';

import { RUBRIQUES_OFFRE } from '../audio-rules/controle-devis';
import { TAUX_AMO_GENERAL, VALIDITE_MINIMALE_DEVIS_MOIS } from '../audio-rules/constantes';
import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { STATUTS_DOSSIER } from '../dossier/etats';
import { centimes, centimesDepuisSaisieEuros, type Centimes } from '../money';
import { numeroSerieSchema } from '../stock/numero-serie';
import { STATUTS_DEVIS } from './etats';

const identifiantSchema = (message: string) => z.uuid({ error: message });

const montantSchema = z
  .string({ error: 'Le montant est obligatoire.' })
  .transform((saisie, ctx): Centimes => {
    const montant = centimesDepuisSaisieEuros(saisie);
    if (montant === null) {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide (exemple : 950,00).' });
      return z.NEVER;
    }
    return centimes(montant);
  });

const montantOptionnelSchema = texteOptionnelSchema.pipe(montantSchema.nullable());

const dateOptionnelleSchema = texteOptionnelSchema.pipe(dateCalendaireSchema.nullable());

const prixLigneSchema = z
  .object({ prixAvantRemise: montantSchema, prix: montantSchema })
  .refine(({ prix, prixAvantRemise }) => prix <= prixAvantRemise, {
    path: ['prix'],
    error: 'Le prix remisé dépasse le prix avant remise.',
  });

const aideSaisieSchema = z
  .object({ modeleId: identifiantSchema('Choisir un modèle.') })
  .and(prixLigneSchema);

const consommableSaisieSchema = z
  .object({
    accessoireId: identifiantSchema('Choisir un article.'),
    quantite: z.coerce
      .number({ error: 'Quantité invalide.' })
      .int('Quantité invalide.')
      .min(1, 'Quantité invalide.')
      .max(999, 'Quantité invalide.'),
  })
  .and(prixLigneSchema);

/** Seule l'autre offre a une colonne de remise (modèle p. 1, tableaux 1.1 et 1.2). */
const offreSaisieSchema = z
  .object({
    rubrique: z.enum(RUBRIQUES_OFFRE, { error: 'Offre inconnue.' }),
    aideDroite: aideSaisieSchema.nullable(),
    aideGauche: aideSaisieSchema.nullable(),
    consommables: z.array(consommableSaisieSchema).max(20, '20 lignes au maximum.'),
    amcDroite: montantOptionnelSchema,
    amcGauche: montantOptionnelSchema,
    amcConsommables: montantOptionnelSchema,
  })
  .transform((offre) => {
    if (offre.rubrique === 'AUTRE_OFFRE') {
      return offre;
    }
    const sansRemise = <L extends { prix: Centimes }>(ligne: L) => ({
      ...ligne,
      prixAvantRemise: ligne.prix,
    });
    return {
      ...offre,
      aideDroite: offre.aideDroite && sansRemise(offre.aideDroite),
      aideGauche: offre.aideGauche && sansRemise(offre.aideGauche),
      consommables: offre.consommables.map(sansRemise),
    };
  });

export const devisSaisieSchema = z
  .object({
    lieuEmission: texteObligatoire('Le lieu d’émission est obligatoire.', 100),
    validiteMois: z.coerce
      .number({ error: 'Durée de validité invalide.' })
      .int('Durée de validité invalide.')
      .min(1, 'Durée de validité invalide.')
      .max(24, '24 mois au maximum.')
      .default(VALIDITE_MINIMALE_DEVIS_MOIS.valeur),
    tauxAmo: z.coerce
      .number({ error: 'Taux AMO invalide.' })
      .int('Taux AMO invalide.')
      .min(0, 'Taux AMO invalide.')
      .max(100, 'Taux AMO invalide.')
      .default(TAUX_AMO_GENERAL.valeur),
    refusOffreC2S: z.boolean(),
    contratResponsable: z.boolean(),
    bobineTPresentee: z.boolean(),
    ficheTechniqueJointe: z.boolean(),
    depotGarantie: montantOptionnelSchema,
    datePrecedentDroite: dateOptionnelleSchema,
    datePrecedentGauche: dateOptionnelleSchema,
    offres: z.array(offreSaisieSchema).min(1, 'Renseigner l’offre 100 % santé.').max(2),
    /** Statut affiché à l'utilisateur : s'il a changé entre-temps, l'opération est refusée. */
    statutAttendu: z.enum(STATUTS_DOSSIER, { error: 'Statut actuel inconnu.' }),
  })
  .refine(({ offres }) => new Set(offres.map((offre) => offre.rubrique)).size === offres.length, {
    path: ['offres'],
    error: 'Chaque offre ne peut figurer qu’une fois.',
  });
export type DevisSaisie = z.output<typeof devisSaisieSchema>;

/** Verrou optimiste commun aux actions sur un devis existant. */
export const actionDevisSaisieSchema = z.object({
  statutAttendu: z.enum(STATUTS_DEVIS, { error: 'Statut actuel inconnu.' }),
});
export type ActionDevisSaisie = z.output<typeof actionDevisSaisieSchema>;

const numeroSerieOptionnelSchema = texteOptionnelSchema.pipe(numeroSerieSchema.nullable());

/** Les numéros de série se contrôlent oreille par oreille contre le dossier, côté service. */
export const debutEssaiSaisieSchema = actionDevisSaisieSchema.extend({
  offreEssai: z.enum(RUBRIQUES_OFFRE, { error: 'Choisir l’offre retenue pour l’essai.' }),
  numeroSerieDroite: numeroSerieOptionnelSchema,
  numeroSerieGauche: numeroSerieOptionnelSchema,
});
export type DebutEssaiSaisie = z.output<typeof debutEssaiSaisieSchema>;

export const signatureDevisSaisieSchema = actionDevisSaisieSchema.extend({
  offreRetenue: z.enum(RUBRIQUES_OFFRE, { error: 'Choisir l’offre retenue.' }),
  dateSignature: dateCalendaireSchema,
  signe: z.literal(true, { error: 'Cocher la case « signé ».' }),
});
export type SignatureDevisSaisie = z.output<typeof signatureDevisSaisieSchema>;
