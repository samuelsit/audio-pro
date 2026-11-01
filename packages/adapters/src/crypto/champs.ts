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
  InventaireLigne: { justification: 'inventaire_ligne.justification' },
  Dossier: { surdicecite: 'dossier.surdicecite' },
  Commande: {
    motifRefus: 'commande.motif_refus',
    motifAnnulation: 'commande.motif_annulation',
  },
  EcartAchat: { commentaire: 'ecart_achat.commentaire' },
  Facture: { motif: 'facture.motif' },
  TicketSav: {
    description: 'ticket_sav.description',
    diagnostic: 'ticket_sav.diagnostic',
    motifAnnulation: 'ticket_sav.motif_annulation',
    motifFacturation: 'ticket_sav.motif_facturation',
  },
  FactureFournisseur: { motifRejet: 'facture_fournisseur.motif_rejet' },
  FactureFournisseurLigne: { designation: 'facture_fournisseur_ligne.designation' },
  Fse: { contenu: 'fse.contenu' },
  Encaissement: {
    partenaire: 'encaissement.partenaire',
    reference: 'encaissement.reference',
    motif: 'encaissement.motif',
  },
  ReglementOrganisme: { motif: 'reglement_organisme.motif' },
  RegularisationCreance: { motif: 'regularisation_creance.motif' },
  RejetCreance: { motif: 'rejet_creance.motif' },
  SessionCaisse: { justification: 'session_caisse.justification' },
  ComptageCaisse: { justification: 'comptage_caisse.justification' },
  TransitionDossier: { motif: 'transition_dossier.motif' },
  Prescription: { motifForcage: 'prescription.motif_forcage' },
  EssaiAppareil: { motifRetrait: 'essai_appareil.motif_retrait' },
  EssaiRdv: { compteRendu: 'essai_rdv.compte_rendu' },
  ProlongationEssai: { motif: 'prolongation_essai.motif' },
  RendezVous: { notes: 'rendez_vous.notes' },
  ReservationEnLigne: { motif: 'reservation_en_ligne.motif' },
  Notification: { destinataire: 'notification.destinataire' },
  MesureAudiologique: { donnees: 'mesure_audiologique.donnees' },
  Otoscopie: { constat: 'otoscopie.constat' },
  ReponseFormulaire: { reponses: 'reponse_formulaire.reponses' },
};
