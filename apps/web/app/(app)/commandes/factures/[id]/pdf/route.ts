import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { telechargerFactureFournisseur } from '@/server/services/factures-fournisseurs';

/** Fichier reçu de l'extérieur : toujours en téléchargement, jamais affiché sur notre domaine. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/commandes/factures/[id]/pdf'>,
): Promise<Response> {
  const { id } = await params;
  const acteur = await requireSession();
  try {
    const contenu = await telechargerFactureFournisseur(acteur, id);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="facture-fournisseur.pdf"',
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
