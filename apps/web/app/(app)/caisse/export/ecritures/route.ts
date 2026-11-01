import type { NextRequest } from 'next/server';

import { AccesRefuseError } from '@/server/auth/acces';
import { reponseCsv } from '@/server/csv';
import { exporterEcritures } from '@/server/services/export-comptable';

import { centreDeCaisse } from '../../centre';

/** Écritures d'une période. L'export est journalisé par le service. */
export async function GET(requete: NextRequest): Promise<Response> {
  const parametres = Object.fromEntries(requete.nextUrl.searchParams);
  return reponseCsv(`ecritures-${parametres.debut ?? ''}-${parametres.fin ?? ''}.csv`, async () => {
    const { acteur, centreId } = await centreDeCaisse();
    if (!centreId) {
      throw new AccesRefuseError();
    }
    return exporterEcritures(acteur, centreId, parametres);
  });
}
