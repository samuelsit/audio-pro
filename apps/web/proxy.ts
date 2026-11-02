import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

import { CHEMIN_CONNEXION, PREFIXE_COOKIES } from './server/auth/constantes';

/**
 * Redirection optimiste vers la connexion quand aucun cookie de session n'est présent.
 * Ce n'est pas un contrôle d'accès : les gardes serveur vérifient la session en base.
 */
export function proxy(request: NextRequest): NextResponse {
  if (!getSessionCookie(request, { cookiePrefix: PREFIXE_COOKIES })) {
    return NextResponse.redirect(new URL(CHEMIN_CONNEXION, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // `rdv/` et `rdv-widget.js` : parcours public de réservation, sans compte (ADR-021).
  // `document/` : lien sécurisé vers un document, ouvert par la date de naissance (ADR-026).
  // `commande-accuse/` : accusé de réception d'un fournisseur, par jeton signé (ADR-031).
  // `desinscription/`, `l/` : liens reçus par un patient, sans compte (ADR-033).
  matcher: [
    '/((?!connexion|rdv/|document/|commande-accuse/|desinscription/|l/|rdv-widget\\.js|_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
