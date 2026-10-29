'use server';

import { CHOIX_TOUS_LES_CENTRES } from '@ha/domain';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { resoudrePerimetreActeur } from '@/server/auth/acces';
import { COOKIE_CENTRE_COURANT } from '@/server/auth/constantes';
import { requireSession } from '@/server/auth/gardes';

/** Change le centre courant. Seul un choix autorisé est enregistré dans le cookie. */
export async function choisirCentre(choix: string): Promise<void> {
  const acteur = await requireSession();
  const { perimetre } = await resoudrePerimetreActeur(acteur, choix);
  const valeur = perimetre.type === 'tous' ? CHOIX_TOUS_LES_CENTRES : perimetre.centreId;
  (await cookies()).set(COOKIE_CENTRE_COURANT, valeur, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}
