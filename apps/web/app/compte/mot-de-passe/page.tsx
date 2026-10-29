import type { Metadata } from 'next';

import { PageCentree } from '@/components/page-centree';
import { requireSession } from '@/server/auth/gardes';

import { FormulaireMotDePasse } from './formulaire-mot-de-passe';

export const metadata: Metadata = { title: 'Mot de passe – HA-Gestion' };

export default async function PageMotDePasse() {
  const utilisateur = await requireSession({ etapesObligatoires: false });
  return (
    <PageCentree
      titre="Changer le mot de passe"
      description={
        utilisateur.doitChangerMotDePasse
          ? 'Votre mot de passe est provisoire : choisissez-en un nouveau pour continuer.'
          : 'Vos autres sessions seront fermées.'
      }
    >
      <FormulaireMotDePasse />
    </PageCentree>
  );
}
