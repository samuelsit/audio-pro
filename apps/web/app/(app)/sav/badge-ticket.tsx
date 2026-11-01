import {
  LIBELLES_COUVERTURES_SAV,
  LIBELLES_STATUTS_TICKET,
  type CouvertureSav,
  type StatutTicket,
} from '@ha/domain';

import { Badge } from '@/components/ui/badge';

const VARIANTES: Readonly<Record<StatutTicket, 'default' | 'secondary' | 'outline'>> = {
  OUVERT: 'default',
  EN_COURS: 'secondary',
  CHEZ_FABRICANT: 'secondary',
  A_RESTITUER: 'default',
  CLOTURE: 'outline',
  ANNULE: 'outline',
};

export function BadgeTicket({ statut }: { statut: StatutTicket }) {
  return <Badge variant={VARIANTES[statut]}>{LIBELLES_STATUTS_TICKET[statut]}</Badge>;
}

export function BadgeCouverture({ couverture }: { couverture: CouvertureSav }) {
  return (
    <Badge variant={couverture === 'AUCUNE' ? 'outline' : 'secondary'}>
      {LIBELLES_COUVERTURES_SAV[couverture]}
    </Badge>
  );
}
