import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { syntheseBilan } from '@/server/services/audiologie';

/** Synthèse rendue à la demande. Chaque téléchargement écrit une ligne PRINT (service). */
export async function GET(
  _: Request,
  { params }: RouteContext<'/patients/[id]/audiologie/[bilanId]/synthese'>,
): Promise<Response> {
  const { bilanId } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, nomFichier } = await syntheseBilan(acteur, bilanId);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomFichier}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError || erreur instanceof ErreurSaisie) {
      return new Response('Page introuvable.', { status: 404 });
    }
    throw erreur;
  }
}
