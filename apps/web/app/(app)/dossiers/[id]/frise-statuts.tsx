import {
  friseDossier,
  LIBELLES_STATUTS_DOSSIER,
  type EtatEtape,
  type StatutDossier,
} from '@ha/domain';
import { Check } from 'lucide-react';

import { formaterJour } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PassageAffiche } from '@/server/services/dossiers';

const PASTILLES: Readonly<Record<EtatEtape, string>> = {
  FAITE: 'border-primary bg-primary text-primary-foreground',
  COURANTE: 'border-primary text-primary ring-2 ring-primary/30',
  A_VENIR: 'border-border text-muted-foreground',
};

/** Parcours du dossier : passe à la ligne sur un écran étroit. */
export function FriseStatuts({
  statut,
  passages,
}: {
  statut: StatutDossier;
  passages: readonly PassageAffiche[];
}) {
  return (
    <ol aria-label="Avancement du dossier" className="flex flex-wrap gap-x-5 gap-y-3">
      {friseDossier(statut, passages).map((etape, index) => (
        <li
          key={etape.statut}
          aria-current={etape.etat === 'COURANTE' ? 'step' : undefined}
          className="flex items-center gap-2"
        >
          <span
            aria-hidden
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
              PASTILLES[etape.etat],
            )}
          >
            {etape.etat === 'FAITE' ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span className="grid text-sm leading-tight">
            <span className={cn(etape.etat === 'COURANTE' && 'font-medium')}>
              {LIBELLES_STATUTS_DOSSIER[etape.statut]}
            </span>
            {etape.horodatage ? (
              <span className="text-xs text-muted-foreground">
                {formaterJour(etape.horodatage)}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
