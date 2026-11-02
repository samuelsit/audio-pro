import { NextResponse } from 'next/server';

import { adresseVisiteur } from '@/server/reservation-actions';
import { suivreLien } from '@/server/services/liens-patient';

/** Lien court d'un message : le code se résout en une adresse écrite par le serveur, jamais une saisie. */
export async function GET(_: Request, { params }: RouteContext<'/l/[code]'>): Promise<Response> {
  const { code } = await params;
  const cible = await suivreLien(code, await adresseVisiteur());
  return cible === null
    ? new Response('Ce lien n’est plus valide.', { status: 404 })
    : NextResponse.redirect(cible, { headers: { 'Referrer-Policy': 'no-referrer' } });
}
