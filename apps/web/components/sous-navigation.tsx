'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export interface LienSousNavigation {
  readonly href: string;
  readonly libelle: string;
}

const LIENS_AGENDA: readonly LienSousNavigation[] = [
  { href: '/agenda', libelle: 'Agenda' },
  { href: '/agenda/salle-attente', libelle: 'Salle d’attente' },
  { href: '/agenda/creneaux', libelle: 'Prochain créneau' },
];

const LIEN_PARAMETRES_AGENDA: LienSousNavigation = {
  href: '/agenda/parametres',
  libelle: 'Paramètres',
};

export const LIENS_PATIENTS: readonly LienSousNavigation[] = [
  { href: '/patients', libelle: 'Patients' },
  { href: '/prescripteurs', libelle: 'Prescripteurs' },
];

export const LIENS_DOSSIERS: readonly LienSousNavigation[] = [
  { href: '/dossiers', libelle: 'Dossiers' },
  { href: '/essais', libelle: 'Essais en cours' },
];

export const LIENS_PILOTAGE: readonly LienSousNavigation[] = [
  { href: '/tableau-de-bord', libelle: 'Tableau de bord' },
  { href: '/renouvellements', libelle: 'Renouvellements' },
];

export const LIENS_ADMINISTRATION: readonly LienSousNavigation[] = [
  { href: '/admin/centres', libelle: 'Centres' },
  { href: '/admin/utilisateurs', libelle: 'Utilisateurs' },
  { href: '/admin/praticiens', libelle: 'Praticiens' },
  { href: '/admin/fabricants', libelle: 'Fabricants' },
  { href: '/admin/modeles', libelle: 'Modèles' },
  { href: '/admin/accessoires', libelle: 'Accessoires et piles' },
  { href: '/admin/journal', libelle: 'Journal d’audit' },
];

/** Onglets d'une entrée du menu latéral. */
export function SousNavigation({
  liens,
  racine,
}: {
  liens: readonly LienSousNavigation[];
  /** Lien d'une entrée dont les sous-pages ont leur propre onglet : actif sur sa seule adresse. */
  racine?: string;
}) {
  const chemin = usePathname();
  return (
    <nav aria-label="Sous-navigation" className="flex flex-wrap gap-1 border-b pb-2">
      {liens.map(({ href, libelle }) => {
        const actif = chemin === href || (href !== racine && chemin.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
              actif && 'bg-muted font-medium text-foreground',
            )}
          >
            {libelle}
          </Link>
        );
      })}
    </nav>
  );
}

/** Onglets de l'agenda ; les paramètres sont réservés aux rôles de gestion. */
export function SousNavigationAgenda({ gestion }: { gestion: boolean }) {
  return (
    <SousNavigation
      liens={gestion ? [...LIENS_AGENDA, LIEN_PARAMETRES_AGENDA] : LIENS_AGENDA}
      racine="/agenda"
    />
  );
}
