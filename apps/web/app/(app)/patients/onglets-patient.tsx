import Link from 'next/link';

import { cn } from '@/lib/utils';

const ONGLETS = [
  { cle: 'fiche', libelle: 'Fiche', suffixe: '' },
  { cle: 'dossiers', libelle: 'Dossiers', suffixe: '/dossiers' },
  { cle: 'rendez-vous', libelle: 'Rendez-vous', suffixe: '/rendez-vous' },
] as const;

/** Onglets par routes : chaque ouverture passe par le service, donc par le journal d'audit. */
export function OngletsPatient({
  patientId,
  courant,
}: {
  patientId: string;
  courant: (typeof ONGLETS)[number]['cle'];
}) {
  return (
    <nav aria-label="Sections de la fiche patient" className="flex gap-4 border-b">
      {ONGLETS.map(({ cle, libelle, suffixe }) => (
        <Link
          key={cle}
          href={`/patients/${patientId}${suffixe}`}
          aria-current={cle === courant ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground hover:text-foreground',
            cle === courant && 'border-primary font-medium text-foreground',
          )}
        >
          {libelle}
        </Link>
      ))}
    </nav>
  );
}
