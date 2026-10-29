// Constantes sans dépendance serveur, utilisables depuis proxy.ts.

/** Préfixe des cookies d'authentification (session, défi 2FA). */
export const PREFIXE_COOKIES = 'ha';

/** Cookie du centre courant : id d'un centre ou « tous ». Toujours revalidé côté serveur. */
export const COOKIE_CENTRE_COURANT = 'ha_centre';

export const CHEMIN_CONNEXION = '/connexion';
