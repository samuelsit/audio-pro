import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageCentree } from '@/components/page-centree';
import { compteConnecte } from '@/server/auth/gardes';

import { FormulaireConnexion } from './formulaire-connexion';

export const metadata: Metadata = { title: 'Connexion – HA-Gestion' };

export default async function PageConnexion() {
  if (await compteConnecte()) {
    redirect('/');
  }
  return (
    <PageCentree titre="Connexion" description="Accès réservé aux équipes du réseau.">
      <FormulaireConnexion />
    </PageCentree>
  );
}
