import {
  LIBELLES_CONTROLES,
  LIBELLES_OREILLES,
  type Constat,
  type RefusRenouvellement,
} from '@ha/domain';

import { formaterDate } from '@/lib/format';

/** Message d'un contrôle, avec la date de prise en charge possible pour un renouvellement refusé. */
export function texteConstat(
  { code, oreille }: Constat,
  refus: readonly RefusRenouvellement[],
): string {
  const prefixe = oreille === null ? '' : `${LIBELLES_OREILLES[oreille]} : `;
  const date = refus.find((r) => code === 'RENOUVELLEMENT_AVANT_DELAI' && r.oreille === oreille);
  const suite = date ? ` Prise en charge à partir du ${formaterDate(date.dateEligibilite)}.` : '';
  return `${prefixe}${LIBELLES_CONTROLES[code]}${suite}`;
}
