import type { AlerteEssai } from '@ha/domain';

import { Badge } from '@/components/ui/badge';

const LIBELLES_COURTS: Readonly<Record<AlerteEssai, string>> = {
  PROLONGATION_SANS_DEMANDE_ECRITE: 'Prolongation sans demande',
  PROLONGATION_EXCESSIVE: 'Prolongation excessive',
  ECHEANCE_PROCHE: 'Échéance proche',
  ECHEANCE_ATTEINTE: 'Échéance atteinte',
  ECHEANCE_DEPASSEE: 'Dépassement',
  RDV_INSUFFISANTS: 'Moins de 2 RDV',
};

const ALERTES_FORTES: readonly AlerteEssai[] = ['ECHEANCE_DEPASSEE', 'RDV_INSUFFISANTS'];

export function AlertesEssai({ alertes }: { alertes: readonly AlerteEssai[] }) {
  if (alertes.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {alertes.map((alerte) => (
        <Badge key={alerte} variant={ALERTES_FORTES.includes(alerte) ? 'destructive' : 'secondary'}>
          {LIBELLES_COURTS[alerte]}
        </Badge>
      ))}
    </div>
  );
}
