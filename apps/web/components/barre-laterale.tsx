'use client';

import {
  BatteryCharging,
  BookUser,
  Building2,
  ContactRound,
  Ear,
  Factory,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  RefreshCw,
  ScrollText,
  Stethoscope,
  UserCog,
  Users,
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
}

const LIENS_METIER: readonly Lien[] = [
  { href: '/patients', libelle: 'Patients', icone: Users },
  { href: '/dossiers', libelle: 'Dossiers', icone: FolderOpen },
  { href: '/prescripteurs', libelle: 'Prescripteurs', icone: BookUser },
  { href: '/stock', libelle: 'Stock', icone: Package },
  { href: '/a-facturer', libelle: 'À facturer', icone: ReceiptText },
  { href: '/renouvellements', libelle: 'Renouvellements', icone: RefreshCw },
  { href: '/tableau-de-bord', libelle: 'Tableau de bord', icone: LayoutDashboard },
];

const LIENS_ADMIN: readonly Lien[] = [
  { href: '/admin/centres', libelle: 'Centres', icone: Building2 },
  { href: '/admin/utilisateurs', libelle: 'Utilisateurs', icone: UserCog },
  { href: '/admin/praticiens', libelle: 'Praticiens', icone: Stethoscope },
  { href: '/admin/fabricants', libelle: 'Fabricants', icone: Factory },
  { href: '/admin/modeles', libelle: 'Modèles', icone: Ear },
  { href: '/admin/accessoires', libelle: 'Accessoires et piles', icone: BatteryCharging },
  { href: '/admin/journal', libelle: 'Journal d’audit', icone: ScrollText },
];

const LIENS_PIED: readonly Lien[] = [{ href: '/equipe', libelle: 'Équipe', icone: ContactRound }];

function Liens({ liens, auClic }: { liens: readonly Lien[]; auClic?: (() => void) | undefined }) {
  const chemin = usePathname();
  return (
    <ul className="grid gap-0.5">
      {liens.map(({ href, libelle, icone: Icone }) => {
        const actif = chemin === href || chemin.startsWith(`${href}/`);
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
      <Liens liens={LIENS_METIER} auClic={auClic} />
      {estAdmin ? (
        <div className="grid gap-1">
          <p className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Admin
          </p>
          <Liens liens={LIENS_ADMIN} auClic={auClic} />
        </div>
      ) : null}
      <div className="mt-auto border-t pt-4">
        <Liens liens={LIENS_PIED} auClic={auClic} />
      </div>
    </nav>
  );
}

/** Menu latéral, affiché à partir de la largeur « md ». La section Admin n'est rendue que pour l'ADMIN. */
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
