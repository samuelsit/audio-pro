import type { Constat, RefusRenouvellement } from '@ha/domain';

import { texteConstat } from '../affichage';

export function ListeConstats({
  constats,
  refus = [],
}: {
  constats: readonly Constat[];
  refus?: readonly RefusRenouvellement[];
}) {
  return (
    <ul className="grid list-disc gap-1 pl-4">
      {constats.map((constat) => (
        <li key={`${constat.code}-${String(constat.oreille)}`}>{texteConstat(constat, refus)}</li>
      ))}
    </ul>
  );
}
