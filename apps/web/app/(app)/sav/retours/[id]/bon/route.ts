import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { telechargerBonRetour } from '@/server/services/retours-fabricant';

export async function GET(
  _: Request,
  { params }: RouteContext<'/sav/retours/[id]/bon'>,
): Promise<Response> {
  const { id } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, nomFichier } = await telechargerBonRetour(acteur, id);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomFichier}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError || erreur instanceof ErreurDocumentIntrouvable) {
      return new Response('Document indisponible.', { status: 404 });
    }
    throw erreur;
  }
}
