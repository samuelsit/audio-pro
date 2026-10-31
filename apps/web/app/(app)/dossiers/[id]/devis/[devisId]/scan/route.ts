import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { lireScanDevis } from '@/server/services/devis';

/** Devis signé scanné, déchiffré à la volée. L'ouverture est journalisée par le service. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/dossiers/[id]/devis/[devisId]/scan'>,
): Promise<Response> {
  const { devisId } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, type, nomFichier } = await lireScanDevis(acteur, devisId);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `inline; filename="${nomFichier}"`,
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
