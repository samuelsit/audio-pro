export interface SmsSortant {
  readonly destinataire: string;
  readonly texte: string;
}

export interface EmailSortant {
  readonly destinataire: string;
  readonly sujet: string;
  readonly texte: string;
}

/** Envoi au patient. Lève une erreur si l'envoi échoue : l'appelant décide de retenter. */
export interface Notifier {
  envoyerSms(message: SmsSortant): Promise<void>;
  envoyerEmail(message: EmailSortant): Promise<void>;
}
