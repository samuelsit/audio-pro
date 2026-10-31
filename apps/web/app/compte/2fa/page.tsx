import { deuxFacteursObligatoire } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageCentree } from '@/components/page-centree';
import { requireCompte } from '@/server/auth/gardes';

import { ActivationDeuxFacteurs } from './activation';
import { DesactivationDeuxFacteurs } from './desactivation';

export const metadata: Metadata = { title: 'Vérification en deux étapes – HA-Gestion' };

export default async function PageCompteDeuxFacteurs() {
  const utilisateur = await requireCompte({ etapesObligatoires: false });
  if (utilisateur.doitChangerMotDePasse) {
    redirect('/compte/mot-de-passe');
  }
  const obligatoire = deuxFacteursObligatoire(utilisateur.role);

  if (utilisateur.twoFactorEnabled) {
    return (
      <PageCentree
        titre="Vérification en deux étapes"
        description="Activée : un code vous est demandé à chaque connexion."
      >
        {obligatoire ? null : <DesactivationDeuxFacteurs />}
        <Link href="/" className="text-sm underline underline-offset-4">
          Retour à l’accueil
        </Link>
      </PageCentree>
    );
  }

  return (
    <PageCentree
      titre="Activer la vérification en deux étapes"
      description={
        obligatoire
          ? 'Obligatoire pour ce compte avant d’accéder à l’application.'
          : 'Recommandée : elle protège votre compte si votre mot de passe est compromis.'
      }
    >
      <ActivationDeuxFacteurs />
      {obligatoire ? null : (
        <Link href="/" className="text-sm underline underline-offset-4">
          Plus tard
        </Link>
      )}
    </PageCentree>
  );
}
