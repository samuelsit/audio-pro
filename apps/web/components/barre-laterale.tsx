'use client';

import {
  BellRing,
  CalendarDays,
  ContactRound,
  FolderOpen,
  HandCoins,
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface Lien {
  href: string;
  libelle: string;
  icone: LucideIcon;
  /** Autres chemins rattachés à cette entrée (sous-navigation). */
  racines?: readonly string[];
}

const LIENS_METIER: readonly Lien[] = [
  { href: '/agenda', libelle: 'Agenda', icone: CalendarDays },
  { href: '/patients', libelle: 'Patients', icone: Users, racines: ['/prescripteurs'] },
  { href: '/dossiers', libelle: 'Dossiers', icone: FolderOpen, racines: ['/essais'] },
  { href: '/stock', libelle: 'Stock', icone: Package },
  { href: '/commandes', libelle: 'Commandes', icone: ShoppingCart },
  { href: '/a-facturer', libelle: 'Facturation', icone: ReceiptText, racines: ['/factures'] },
  { href: '/caisse', libelle: 'Caisse', icone: Wallet },
  { href: '/tiers-payant', libelle: 'Tiers payant', icone: HandCoins },
  { href: '/sav', libelle: 'SAV', icone: Wrench },
  { href: '/relances', libelle: 'Relances', icone: BellRing },
  {
    href: '/tableau-de-bord',
    libelle: 'Tableau de bord',
    icone: LayoutDashboard,
    racines: ['/renouvellements'],
  },
];

const LIEN_ADMINISTRATION: Lien = {
  href: '/admin/centres',
  libelle: 'Administration',
  icone: Settings,
  racines: ['/admin'],
};

const LIENS_PIED: readonly Lien[] = [{ href: '/equipe', libelle: 'Équipe', icone: ContactRound }];

function Liens({ liens, auClic }: { liens: readonly Lien[]; auClic?: (() => void) | undefined }) {
  const chemin = usePathname();
  return (
    <ul className="grid gap-0.5">
      {liens.map(({ href, libelle, icone: Icone, racines = [] }) => {
        const actif = [href, ...racines].some((r) => chemin === r || chemin.startsWith(`${r}/`));
        return (
          <li key={href}>
            <Link
              href={href}
              {...(auClic ? { onClick: auClic } : {})}
              aria-current={actif ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                actif && 'bg-muted font-medium text-foreground',
              )}
            >
              <Icone className="size-4 shrink-0" aria-hidden />
              {libelle}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Navigation({
  estAdmin,
  auClic,
}: {
  estAdmin: boolean;
  auClic?: (() => void) | undefined;
}) {
  return (
    <nav aria-label="Navigation principale" className="flex h-full flex-col gap-6">
      <Liens
        liens={estAdmin ? [...LIENS_METIER, LIEN_ADMINISTRATION] : LIENS_METIER}
        auClic={auClic}
      />
      <div className="mt-auto border-t pt-4">
        <Liens liens={LIENS_PIED} auClic={auClic} />
      </div>
    </nav>
  );
}

/** Menu latéral, affiché à partir de la largeur « md ». L'entrée Administration n'est rendue que pour l'ADMIN_CLIENT. */
export function BarreLaterale({ estAdmin }: { estAdmin: boolean }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r px-3 py-6 md:block">
      <Navigation estAdmin={estAdmin} />
    </aside>
  );
}

/** Le même menu dans un panneau, sur petit écran. */
export function MenuMobile({ estAdmin }: { estAdmin: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Sheet open={ouvert} onOpenChange={setOuvert}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 px-3">
        <SheetHeader className="px-3">
          <SheetTitle>HA-Gestion</SheetTitle>
        </SheetHeader>
        <Navigation estAdmin={estAdmin} auClic={() => setOuvert(false)} />
      </SheetContent>
    </Sheet>
  );
}
