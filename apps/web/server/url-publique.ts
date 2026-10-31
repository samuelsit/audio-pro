/** Adresse publique de l'application, celle des liens envoyés aux patients et du widget. */
export function urlPublique(): string {
  return process.env.URL_PUBLIQUE ?? process.env.BETTER_AUTH_URL ?? '';
}
