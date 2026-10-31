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
  matcher: [
    '/((?!connexion|rdv/|rdv-widget\\.js|_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
