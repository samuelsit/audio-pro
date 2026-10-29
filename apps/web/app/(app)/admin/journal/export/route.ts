import { SystemClock } from '@ha/adapters';
import type { NextRequest } from 'next/server';

import { AccesRefuseError } from '@/server/auth/acces';
import { perimetreCourant } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { exporterJournal } from '@/server/services/journal';

/**
 * Export CSV du journal d'audit (ADMIN), mêmes filtres que l'écran. Réponse en flux, BOM UTF-8 pour
 * que le tableur reconnaisse l'encodage. L'export est journalisé par le service.
 */
export async function GET(requete: NextRequest): Promise<Response> {
  let lignes: AsyncGenerator<string>;
  try {
    const { acteur, perimetre } = await perimetreCourant();
    lignes = await exporterJournal(
      acteur,
      perimetre,
      Object.fromEntries(requete.nextUrl.searchParams),
    );
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
      controleur.enqueue(encodeur.encode('﻿'));
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

  const jour = new SystemClock().now().slice(0, 10);
  return new Response(flux, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="journal-audit-${jour}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
