import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { imprimerDevis } from '@/server/services/devis';

/** PDF remis au patient, déchiffré à la volée. Chaque ouverture écrit une ligne PRINT (service). */
export async function GET(
  _: Request,
  { params }: RouteContext<'/dossiers/[id]/devis/[devisId]/pdf'>,
): Promise<Response> {
  const { devisId } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, type, nomFichier } = await imprimerDevis(acteur, devisId);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': type,
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
