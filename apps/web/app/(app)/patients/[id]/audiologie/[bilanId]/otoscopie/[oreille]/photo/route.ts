import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { lirePhotoOtoscopie } from '@/server/services/audiologie';

/** Photo d'otoscopie, déchiffrée à la demande. Chaque ouverture écrit une ligne READ (service). */
export async function GET(
  _: Request,
  { params }: RouteContext<'/patients/[id]/audiologie/[bilanId]/otoscopie/[oreille]/photo'>,
): Promise<Response> {
  const { bilanId, oreille } = await params;
  const acteur = await requireSession();
  try {
    const { contenu, type } = await lirePhotoOtoscopie(acteur, bilanId, oreille);
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError) {
      return new Response('Page introuvable.', { status: 404 });
    }
    throw erreur;
  }
}
