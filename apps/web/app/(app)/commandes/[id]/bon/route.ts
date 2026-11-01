import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { telechargerBon } from '@/server/services/envoi-commandes';

/** Bon envoyé, ou aperçu avant envoi. Réservé aux rôles qui voient les prix d'achat. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/commandes/[id]/bon'>,
): Promise<Response> {
  const { id } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, nomFichier } = await telechargerBon(acteur, id);
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
