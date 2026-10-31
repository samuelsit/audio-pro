/** Preuve anti-robot : un défi remis au navigateur, puis sa réponse vérifiée côté serveur. */
export interface Captcha {
  /** Défi sérialisé, passé tel quel au composant du navigateur. */
  creerDefi(): Promise<string>;
  verifier(reponse: string): Promise<boolean>;
}
