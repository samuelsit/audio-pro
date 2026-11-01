import type { NextRequest } from 'next/server';

import { perimetreCourant } from '@/server/auth/gardes';
import { reponseCsv } from '@/server/csv';
import { exporterAchats } from '@/server/services/statistiques-achats';

/** Export CSV des achats, mêmes filtres que l'écran. L'export est journalisé par le service. */
export async function GET(requete: NextRequest): Promise<Response> {
  const { du, au } = Object.fromEntries(requete.nextUrl.searchParams);
  return reponseCsv(`achats-${du ?? ''}-${au ?? ''}.csv`, async () => {
    const { acteur, perimetre } = await perimetreCourant();
    return exporterAchats(acteur, perimetre, Object.fromEntries(requete.nextUrl.searchParams));
  });
}
