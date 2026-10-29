import { z } from 'zod';

export const ACTIONS_AUDIT = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXPORT',
  'PRINT',
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
  CONNEXION: 'Connexion',
  ECHEC_CONNEXION: 'Échec de connexion',
  DECONNEXION: 'Déconnexion',
};

/** Types d'entité journalisés. Liste extensible sans migration (colonne texte en base). */
export const TYPES_ENTITE = [
  'CENTRE',
  'UTILISATEUR',
  'PRATICIEN',
  'SESSION',
  'JOURNAL_AUDIT',
  'PATIENT',
  'DOSSIER',
] as const;

export const typeEntiteSchema = z.enum(TYPES_ENTITE, { error: 'Type d’entité inconnu.' });
export type TypeEntite = z.infer<typeof typeEntiteSchema>;

export const LIBELLES_TYPES_ENTITE: Readonly<Record<TypeEntite, string>> = {
  CENTRE: 'Centre',
  UTILISATEUR: 'Utilisateur',
  PRATICIEN: 'Praticien',
  SESSION: 'Session',
  JOURNAL_AUDIT: 'Journal d’audit',
  PATIENT: 'Patient',
  DOSSIER: 'Dossier',
};
