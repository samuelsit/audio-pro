import { SystemClock } from '@ha/adapters';
import type { NextRequest } from 'next/server';

import { perimetreCourant } from '@/server/auth/gardes';
import { reponseCsv } from '@/server/csv';
import { exporterJournal } from '@/server/services/journal';

/** Export CSV du journal d'audit (ADMIN), mêmes filtres que l'écran. Journalisé par le service. */
export async function GET(requete: NextRequest): Promise<Response> {
  const jour = new SystemClock().now().slice(0, 10);
  return reponseCsv(`journal-audit-${jour}.csv`, async () => {
    const { acteur, perimetre } = await perimetreCourant();
    return exporterJournal(acteur, perimetre, Object.fromEntries(requete.nextUrl.searchParams));
  });
}
