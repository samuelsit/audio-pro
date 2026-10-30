import { SystemClock } from '@ha/adapters';

import { reponseCsv } from '@/server/csv';
import { perimetreCourant } from '@/server/auth/gardes';
import { exporterStockAccessoires } from '@/server/services/stock';

/** Export CSV des quantités du périmètre courant. L'export est journalisé par le service. */
export async function GET(): Promise<Response> {
  const jour = new SystemClock().now().slice(0, 10);
  return reponseCsv(`stock-accessoires-${jour}.csv`, async () => {
    const { acteur, perimetre } = await perimetreCourant();
    return exporterStockAccessoires(acteur, perimetre);
  });
}
