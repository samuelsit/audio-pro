import { AccesRefuseError } from './auth/acces';
import { ErreurSaisie } from './erreurs';

/**
 * Réponse CSV en flux, avec BOM UTF-8 pour que le tableur reconnaisse l'encodage.
 * Accès refusé : 404, comme une page ; filtres invalides : 400.
 * `pourTableur: false` : un fichier pour un logiciel, sans BOM.
 */
export async function reponseCsv(
  nomFichier: string,
  produire: () => Promise<AsyncGenerator<string>>,
  { pourTableur = true }: { readonly pourTableur?: boolean } = {},
): Promise<Response> {
  let lignes: AsyncGenerator<string>;
  try {
    lignes = await produire();
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError) {
      return new Response('Page introuvable.', { status: 404 });
    }
    if (erreur instanceof ErreurSaisie) {
      return new Response('Filtres invalides.', { status: 400 });
    }
    throw erreur;
  }

  const encodeur = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    start(controleur) {
      if (pourTableur) {
        controleur.enqueue(encodeur.encode('﻿'));
      }
    },
    async pull(controleur) {
      const { value, done } = await lignes.next();
      if (done) {
        controleur.close();
      } else {
        controleur.enqueue(encodeur.encode(value));
      }
    },
    async cancel() {
      await lignes.return(undefined);
    },
  });

  return new Response(flux, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
      'Cache-Control': 'no-store',
    },
  });
}
