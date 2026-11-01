import { SystemClock } from '@ha/adapters';
import type { NextRequest } from 'next/server';

import { perimetreCourant } from '@/server/auth/gardes';
import { reponseCsv } from '@/server/csv';
import { exporterCreances } from '@/server/services/tiers-payant';

/** Export CSV des créances, mêmes filtres que l'écran. L'export est journalisé par le service. */
export async function GET(requete: NextRequest): Promise<Response> {
  const jour = new SystemClock().now().slice(0, 10);
  return reponseCsv(`creances-${jour}.csv`, async () => {
    const { acteur, perimetre } = await perimetreCourant();
    return exporterCreances(acteur, perimetre, Object.fromEntries(requete.nextUrl.searchParams));
  });
}
