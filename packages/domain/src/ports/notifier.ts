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
  /** Adresse de réponse, si elle diffère de l'expéditeur. */
  readonly repondreA?: string;
  /** Réservées aux fournisseurs : un patient reçoit un lien sécurisé, jamais une pièce jointe (CLAUDE.md). */
  readonly piecesJointes?: readonly PieceJointe[];
}

/** Envoi à un patient, un prescripteur ou un fournisseur. Lève une erreur si l'envoi échoue : l'appelant décide de retenter. */
export interface Notifier {
  envoyerSms(message: SmsSortant): Promise<void>;
  envoyerEmail(message: EmailSortant): Promise<void>;
}
