import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { lireJustificatifPec } from '@/server/services/factures';

/** Justificatif de la prise en charge, déchiffré à la volée. L'ouverture est journalisée par le service. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/dossiers/[id]/facture/justificatif'>,
): Promise<Response> {
  const { id } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, type, nomFichier } = await lireJustificatifPec(acteur, id);
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
