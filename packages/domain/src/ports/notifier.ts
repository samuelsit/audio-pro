import type { EtatFournisseur } from '../communication/suivi';

export interface SmsSortant {
  readonly destinataire: string;
  readonly texte: string;
}

export interface PieceJointe {
  readonly nomFichier: string;
  readonly typeContenu: string;
  readonly contenu: Uint8Array;
}

export interface EmailSortant {
  readonly destinataire: string;
  readonly sujet: string;
  readonly texte: string;
  /** Adresse de réponse, à la place de l'expéditeur technique. */
  readonly repondreA?: string;
  /** Réservées aux fournisseurs : un patient reçoit un lien, jamais une pièce jointe (CLAUDE.md). */
  readonly piecesJointes?: readonly PieceJointe[];
  /** Page de désinscription, à reprendre dans les en-têtes si le fournisseur l'admet. */
  readonly lienDesinscription?: string;
}

/** Lot de lettres déjà déposé dans le stockage. */
export interface CourrierSortant {
  readonly cleDocument: string;
  readonly lettres: number;
}

export interface RecuEnvoi {
  /** Identifiant chez le fournisseur, pour relire l'envoi. `null` s'il n'en donne pas. */
  readonly idFournisseur: string | null;
  /** Crédits débités, `null` s'il n'en facture pas au message. */
  readonly credits: number | null;
}

/** Canaux dont le fournisseur rend un accusé. */
export type CanalSuivi = 'SMS' | 'EMAIL';

/**
 * Sortie des messages. Une erreur levée signale un envoi à reprendre : c'est l'appelant qui en décide.
 * Statuts et oppositions se relisent chez le fournisseur : aucun des deux ne signe ses appels entrants (ADR-034).
 */
export interface Notifier {
  envoyerSms(message: SmsSortant): Promise<RecuEnvoi>;
  envoyerEmail(message: EmailSortant): Promise<RecuEnvoi>;
  /** Sans prestataire postal, le lot reste à imprimer au centre : le reçu n'a pas d'identifiant. */
  envoyerCourrier(message: CourrierSortant): Promise<RecuEnvoi>;
  etatEnvoi(canal: CanalSuivi, idFournisseur: string): Promise<EtatFournisseur>;
  /** Numéros qui ont répondu STOP. */
  oppositionsSms(): Promise<readonly string[]>;
  /** Le patient a de nouveau consenti : le fournisseur doit le rouvrir aussi. */
  retirerOppositionSms(numero: string): Promise<void>;
}
