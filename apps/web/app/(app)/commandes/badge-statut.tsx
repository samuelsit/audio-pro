import { LIBELLES_STATUTS_COMMANDE, type StatutCommande } from '@ha/domain';

import { Badge } from '@/components/ui/badge';

const VARIANTES: Readonly<Record<StatutCommande, 'default' | 'secondary' | 'outline'>> = {
  BROUILLON: 'outline',
  A_APPROUVER: 'default',
  APPROUVEE: 'secondary',
  ENVOYEE: 'secondary',
  PARTIELLEMENT_RECUE: 'default',
  RECUE: 'secondary',
  FACTUREE: 'secondary',
  CLOSE: 'outline',
  ANNULEE: 'outline',
};

export function BadgeStatutCommande({ statut }: { statut: StatutCommande }) {
  return <Badge variant={VARIANTES[statut]}>{LIBELLES_STATUTS_COMMANDE[statut]}</Badge>;
}
