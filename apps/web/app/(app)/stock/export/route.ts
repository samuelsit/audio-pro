import { SystemClock } from '@ha/adapters';
import type { NextRequest } from 'next/server';

import { reponseCsv } from '@/server/csv';
import { perimetreCourant } from '@/server/auth/gardes';
import { exporterStock } from '@/server/services/stock';

/** Export CSV du stock, mêmes filtres que l'écran. L'export est journalisé par le service. */
export async function GET(requete: NextRequest): Promise<Response> {
  const jour = new SystemClock().now().slice(0, 10);
  return reponseCsv(`stock-${jour}.csv`, async () => {
    const { acteur, perimetre } = await perimetreCourant();
    return exporterStock(acteur, perimetre, Object.fromEntries(requete.nextUrl.searchParams));
  });
}
