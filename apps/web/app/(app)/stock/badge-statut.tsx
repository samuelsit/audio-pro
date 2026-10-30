import { LIBELLES_STATUTS_APPAREIL, type StatutAppareil } from '@ha/domain';

import { Badge } from '@/components/ui/badge';

const VARIANTES: Readonly<Record<StatutAppareil, 'default' | 'secondary' | 'outline'>> = {
  EN_STOCK: 'default',
  RESERVE: 'secondary',
  EN_ESSAI: 'secondary',
  PRET: 'secondary',
  VENDU: 'outline',
  SAV: 'outline',
  RETOUR_FABRICANT: 'outline',
};

export function BadgeStatut({ statut }: { statut: StatutAppareil }) {
  return <Badge variant={VARIANTES[statut]}>{LIBELLES_STATUTS_APPAREIL[statut]}</Badge>;
}
