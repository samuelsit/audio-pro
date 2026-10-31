import { z } from 'zod';

export const ACTIONS_AUDIT = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXPORT',
  'PRINT',
  'SEND',
  'CONNEXION',
  'ECHEC_CONNEXION',
  'DECONNEXION',
] as const;

export const actionAuditSchema = z.enum(ACTIONS_AUDIT, { error: 'Action inconnue.' });
export type ActionAudit = z.infer<typeof actionAuditSchema>;

export const LIBELLES_ACTIONS_AUDIT: Readonly<Record<ActionAudit, string>> = {
  READ: 'Consultation',
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  EXPORT: 'Export',
  PRINT: 'Impression',
  SEND: 'Envoi',
  CONNEXION: 'Connexion',
  ECHEC_CONNEXION: 'Échec de connexion',
  DECONNEXION: 'Déconnexion',
};

/** Types d'entité journalisés. Liste extensible sans migration (colonne texte en base). */
export const TYPES_ENTITE = [
  'ORGANISATION',
  'CENTRE',
  'UTILISATEUR',
  'PRATICIEN',
  'SESSION',
  'JOURNAL_AUDIT',
  'PATIENT',
  'DOSSIER',
  'PRESCRIPTION',
  'DEVIS',
  'ESSAI',
  'FACTURE_PREPAREE',
  'FABRICANT',
  'MODELE_AIDE_AUDITIVE',
  'ACCESSOIRE',
  'PRESCRIPTEUR',
  'APPAREIL',
  'STOCK_ACCESSOIRE',
  'RENDEZ_VOUS',
  'TYPE_RDV',
  'CABINE',
  'EXCEPTION_AGENDA',
  'PARAMETRES_RESERVATION',
  'BILAN_AUDIOLOGIQUE',
  'MESURE_AUDIOLOGIQUE',
  'OTOSCOPIE',
  'MODELE_FORMULAIRE',
  'REPONSE_FORMULAIRE',
] as const;

export const typeEntiteSchema = z.enum(TYPES_ENTITE, { error: 'Type d’entité inconnu.' });
export type TypeEntite = z.infer<typeof typeEntiteSchema>;

export const LIBELLES_TYPES_ENTITE: Readonly<Record<TypeEntite, string>> = {
  ORGANISATION: 'Client',
  CENTRE: 'Centre',
  UTILISATEUR: 'Utilisateur',
  PRATICIEN: 'Praticien',
  SESSION: 'Session',
  JOURNAL_AUDIT: 'Journal d’audit',
  PATIENT: 'Patient',
  DOSSIER: 'Dossier',
  PRESCRIPTION: 'Prescription',
  DEVIS: 'Devis',
  ESSAI: 'Essai',
  FACTURE_PREPAREE: 'Facture préparée',
  FABRICANT: 'Fabricant',
  MODELE_AIDE_AUDITIVE: 'Modèle d’aide auditive',
  ACCESSOIRE: 'Accessoire',
  PRESCRIPTEUR: 'Prescripteur',
  APPAREIL: 'Appareil',
  STOCK_ACCESSOIRE: 'Stock d’accessoires',
  RENDEZ_VOUS: 'Rendez-vous',
  PARAMETRES_RESERVATION: 'Réservation en ligne',
  BILAN_AUDIOLOGIQUE: 'Bilan audiologique',
  MESURE_AUDIOLOGIQUE: 'Mesure audiologique',
  OTOSCOPIE: 'Otoscopie',
  MODELE_FORMULAIRE: 'Modèle de formulaire',
  REPONSE_FORMULAIRE: 'Réponse à un formulaire',
  TYPE_RDV: 'Type de rendez-vous',
  CABINE: 'Cabine',
  EXCEPTION_AGENDA: 'Exception d’agenda',
};
