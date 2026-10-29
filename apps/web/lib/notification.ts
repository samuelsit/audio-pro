/** Notification transmise d'une server action à la page suivante, par un cookie de courte durée. */
export interface Notification {
  message: string;
  type: 'succes' | 'erreur';
}

/** Non HttpOnly : lu puis effacé par le navigateur. Ne jamais y mettre de donnée patient. */
export const COOKIE_NOTIFICATION = 'ha_notification';
