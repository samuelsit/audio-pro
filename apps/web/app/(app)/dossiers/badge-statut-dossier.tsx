import { LIBELLES_STATUTS_DOSSIER, type StatutDossier } from '@ha/domain';

import { Badge } from '@/components/ui/badge';

function variante(statut: StatutDossier): 'secondary' | 'outline' | 'destructive' {
  if (statut === 'ABANDONNE') {
    return 'destructive';
  }
  return statut === 'CLOS' ? 'outline' : 'secondary';
}

export function BadgeStatutDossier({ statut }: { statut: StatutDossier }) {
  return <Badge variant={variante(statut)}>{LIBELLES_STATUTS_DOSSIER[statut]}</Badge>;
}
