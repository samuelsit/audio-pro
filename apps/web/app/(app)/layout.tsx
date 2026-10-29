import { AucunCentreAccessibleError, LIBELLES_ROLES, type Perimetre } from '@ha/domain';
import type { ReactNode } from 'react';

import { MenuUtilisateur } from '@/components/menu-utilisateur';
import { Navigation } from '@/components/navigation';
import { PageCentree } from '@/components/page-centree';
import { SelecteurCentre, VALEUR_TOUS } from '@/components/selecteur-centre';
import { Button } from '@/components/ui/button';
import { perimetreCourant } from '@/server/auth/gardes';

import { seDeconnecter } from '../compte/actions';
import { choisirCentre } from './actions';

const LIENS = [
  { href: '/', libelle: 'Accueil' },
  { href: '/equipe', libelle: 'Équipe' },
];

const LIENS_ADMIN = [
  { href: '/admin/centres', libelle: 'Centres' },
  { href: '/admin/utilisateurs', libelle: 'Utilisateurs' },
  { href: '/admin/praticiens', libelle: 'Praticiens' },
];

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
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-semibold tracking-tight">HA-Gestion</span>
          <SelecteurCentre
            centres={centres}
            valeur={valeurSelecteur(perimetre)}
            tousLesCentres={estAdmin}
            choisir={choisirCentre}
          />
          <Navigation liens={estAdmin ? [...LIENS, ...LIENS_ADMIN] : LIENS} />
          <div className="ml-auto">
            <MenuUtilisateur
              nom={`${acteur.prenom} ${acteur.nom}`}
              role={LIBELLES_ROLES[acteur.role]}
              seDeconnecter={seDeconnecter}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
