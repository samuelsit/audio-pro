import Link from 'next/link';
import type { ReactNode } from 'react';

import { MenuUtilisateur } from '@/components/menu-utilisateur';
import { requireSuperadmin } from '@/server/auth/gardes';

import { seDeconnecter } from '../compte/actions';

/** Console éditeur : hors de toute organisation, sans sélecteur de centre ni menu métier. */
export default async function LayoutConsole({ children }: { children: ReactNode }) {
  const acteur = await requireSuperadmin();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/console" className="font-semibold tracking-tight">
            HA-Gestion – Console éditeur
          </Link>
          <Link href="/console/tva" className="text-sm underline-offset-4 hover:underline">
            Taux de TVA
          </Link>
          <div className="ml-auto">
            <MenuUtilisateur
              nom={`${acteur.prenom} ${acteur.nom}`}
              role="Éditeur"
              seDeconnecter={seDeconnecter}
            />
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
