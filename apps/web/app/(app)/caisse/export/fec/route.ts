import type { NextRequest } from 'next/server';

import { AccesRefuseError } from '@/server/auth/acces';
import { ErreurSaisie } from '@/server/erreurs';
import { produireFec } from '@/server/services/export-comptable';

import { centreDeCaisse } from '../../centre';

/** Le FEC ou sa description : deux fichiers, le second accompagne obligatoirement le premier. */
export async function GET(requete: NextRequest): Promise<Response> {
  const { searchParams } = requete.nextUrl;
  try {
    const { acteur, centreId } = await centreDeCaisse();
    if (!centreId) {
      throw new AccesRefuseError();
    }
    const fec = await produireFec(acteur, centreId, { date: searchParams.get('date') });
    const description = searchParams.get('document') === 'description';
    const nom = description ? `${fec.nom}-description.txt` : `${fec.nom}.txt`;
    return new Response(description ? fec.description : fec.contenu, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError) {
      return new Response('Page introuvable.', { status: 404 });
    }
    if (erreur instanceof ErreurSaisie) {
      return new Response(erreur.message, { status: 400 });
    }
    throw erreur;
  }
}
