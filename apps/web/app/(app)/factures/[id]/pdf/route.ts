import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { telechargerPdf } from '@/server/services/facturation';

/** Original à la première sortie, duplicata marqué ensuite : chaque sortie est journalisée et chaînée. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/factures/[id]/pdf'>,
): Promise<Response> {
  const { id } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, nomFichier } = await telechargerPdf(acteur, id);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomFichier}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (erreur) {
    if (
      erreur instanceof AccesRefuseError ||
      erreur instanceof ErreurDocumentIntrouvable ||
      erreur instanceof ErreurSaisie
    ) {
      return new Response('Page introuvable.', { status: 404 });
    }
    throw erreur;
  }
}
