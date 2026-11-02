import { desinscrire } from '@/server/services/liens-patient';

/** Désabonnement en un clic d'un client de messagerie (RFC 8058) : POST seulement, sans page. */
export async function POST(
  _: Request,
  { params }: RouteContext<'/desinscription/[jeton]/un-clic'>,
): Promise<Response> {
  const { jeton } = await params;
  const fait = await desinscrire(jeton);
  return new Response(null, { status: fait ? 200 : 404 });
}
