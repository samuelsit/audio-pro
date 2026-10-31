import { dossierAccepteDevis, LIBELLES_STATUTS_DEVIS, type StatutDossier } from '@ha/domain';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import type { DevisResume } from '@/server/services/devis';

/** Versions du devis, la plus récente d'abord, et accès à la rédaction. */
export function BlocDevis({
  dossierId,
  statut,
  versions,
}: {
  dossierId: string;
  statut: StatutDossier;
  versions: readonly DevisResume[];
}) {
  if (versions.length === 0) {
    return dossierAccepteDevis(statut) ? (
      <div>
        <Button asChild>
          <Link href={`/dossiers/${dossierId}/devis/nouveau`}>Établir le devis</Link>
        </Button>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">
        Le devis s’établit une fois la prescription enregistrée.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 text-sm">
      {versions.map((v) => (
        <li key={v.id} className="flex flex-wrap gap-x-3">
          <Link
            href={`/dossiers/${dossierId}/devis/${v.id}`}
            className="underline underline-offset-4"
          >
            Devis {v.numero} v{v.version}
          </Link>
          <span>{LIBELLES_STATUTS_DEVIS[v.statut]}</span>
          {v.dateEmission ? <span>émis le {formaterDate(v.dateEmission)}</span> : null}
          {v.dateFinValidite ? (
            <span>valable jusqu’au {formaterDate(v.dateFinValidite)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
