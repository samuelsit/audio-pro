import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { telechargerArchive } from '@/server/services/caisse';

/** Le fichier en clair, tel que son empreinte le décrit. Chaque téléchargement est journalisé. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/caisse/archives/[id]/fichier'>,
): Promise<Response> {
  const { id } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, nom } = await telechargerArchive(acteur, id);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError || erreur instanceof ErreurDocumentIntrouvable) {
      return new Response('Page introuvable.', { status: 404 });
    }
    throw erreur;
  }
}
