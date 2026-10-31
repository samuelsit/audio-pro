import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { lireScan } from '@/server/services/dossiers';

/**
 * Scan d'une ordonnance, déchiffré à la volée. L'ouverture est journalisée par le service.
 * Accès refusé : 404, comme une page. Le type vient de la signature vérifiée au dépôt.
 */
export async function GET(
  _: Request,
  { params }: RouteContext<'/dossiers/[id]/prescriptions/[prescriptionId]/scan'>,
): Promise<Response> {
  const { id, prescriptionId } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, type, nomFichier } = await lireScan(acteur, id, prescriptionId);
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
