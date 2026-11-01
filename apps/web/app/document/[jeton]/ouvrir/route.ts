import { ErreurDocumentIntrouvable } from '@ha/domain';

import { AccesRefuseError } from '@/server/auth/acces';
import { ErreurSaisie } from '@/server/erreurs';
import { adresseVisiteur } from '@/server/reservation-actions';
import { ouvrirDocument } from '@/server/services/liens-document';

function retour(jeton: string, erreur?: 'date'): Response {
  const parametres = erreur ? `?erreur=${erreur}` : '';
  return new Response(null, {
    status: 303,
    headers: { Location: `/document/${jeton}${parametres}` },
  });
}

/** Document déchiffré à la volée, jamais mis en cache. L'ouverture est journalisée par le service. */
export async function POST(
  request: Request,
  { params }: RouteContext<'/document/[jeton]/ouvrir'>,
): Promise<Response> {
  const { jeton } = await params;
  const formulaire = await request.formData();
  try {
    const { contenu, type, nomFichier } = await ouvrirDocument(jeton, await adresseVisiteur(), {
      dateNaissance: formulaire.get('dateNaissance'),
    });
    return new Response(Buffer.from(contenu), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `inline; filename="${nomFichier}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (erreur) {
    if (erreur instanceof ErreurSaisie) {
      return retour(jeton, 'date');
    }
    if (erreur instanceof AccesRefuseError || erreur instanceof ErreurDocumentIntrouvable) {
      return retour(jeton);
    }
    throw erreur;
  }
}
