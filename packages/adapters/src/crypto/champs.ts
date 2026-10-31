import type { ConfigurationChampsChiffres } from './prisma';

/**
 * Champs chiffrés en base, par modèle Prisma, avec leur contexte (voir ADR-005).
 * Chaque colonne ajoutée ici reçoit aussi une contrainte `CHECK (colonne LIKE 'v1.%')` dans sa migration.
 */
export const CHAMPS_CHIFFRES: ConfigurationChampsChiffres = {
  Patient: { notes: 'patient.notes' },
  CouvertureAmo: { nir: 'couverture_amo.nir', ald: 'couverture_amo.ald' },
  MouvementAppareil: { motif: 'mouvement_appareil.motif' },
  MouvementAccessoire: { motif: 'mouvement_accessoire.motif' },
  Dossier: { surdicecite: 'dossier.surdicecite' },
  TransitionDossier: { motif: 'transition_dossier.motif' },
  Prescription: { motifForcage: 'prescription.motif_forcage' },
  EssaiAppareil: { motifRetrait: 'essai_appareil.motif_retrait' },
  EssaiRdv: { compteRendu: 'essai_rdv.compte_rendu' },
  ProlongationEssai: { motif: 'prolongation_essai.motif' },
  RendezVous: { notes: 'rendez_vous.notes' },
  ReservationEnLigne: { motif: 'reservation_en_ligne.motif' },
  Notification: { destinataire: 'notification.destinataire' },
};
