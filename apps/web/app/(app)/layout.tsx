import { AucunCentreAccessibleError, LIBELLES_ROLES, type Perimetre } from '@ha/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { BarreLaterale, MenuMobile } from '@/components/barre-laterale';
import { MenuUtilisateur } from '@/components/menu-utilisateur';
import { PageCentree } from '@/components/page-centree';
import { SelecteurCentre, VALEUR_TOUS } from '@/components/selecteur-centre';
import { Button } from '@/components/ui/button';
import { perimetreCourant } from '@/server/auth/gardes';

import { seDeconnecter } from '../compte/actions';
import { choisirCentre } from './actions';

function valeurSelecteur(perimetre: Perimetre): string {
  return perimetre.type === 'tous' ? VALEUR_TOUS : perimetre.centreId;
}

export default async function LayoutApplication({ children }: { children: ReactNode }) {
  let contexte;
  try {
    contexte = await perimetreCourant();
  } catch (erreur) {
    if (erreur instanceof AucunCentreAccessibleError) {
      return (
        <PageCentree titre="Aucun centre">
          <p>{erreur.message}</p>
          <form action={seDeconnecter}>
            <Button type="submit" variant="outline">
              Se déconnecter
            </Button>
          </form>
        </PageCentree>
      );
    }
    throw erreur;
  }
  const { acteur, perimetre, centres } = contexte;
  const estAdmin = acteur.role === 'ADMIN';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <MenuMobile estAdmin={estAdmin} />
          <Link href="/" className="font-semibold tracking-tight md:w-52">
            HA-Gestion
          </Link>
          <SelecteurCentre
            centres={centres}
            valeur={valeurSelecteur(perimetre)}
            tousLesCentres={estAdmin}
            choisir={choisirCentre}
          />
          <div className="ml-auto">
            <MenuUtilisateur
              nom={`${acteur.prenom} ${acteur.nom}`}
              role={LIBELLES_ROLES[acteur.role]}
              seDeconnecter={seDeconnecter}
            />
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <BarreLaterale estAdmin={estAdmin} />
        <main className="min-w-0 flex-1 px-4 py-8 md:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
