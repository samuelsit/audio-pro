import type { Metadata } from 'next';
import Link from 'next/link';

import { PageCentree } from '@/components/page-centree';

import { FormulaireCode } from './formulaire-code';

export const metadata: Metadata = { title: 'Vérification en deux étapes – HA-Gestion' };

export default function PageDeuxFacteurs() {
  return (
    <PageCentree
      titre="Vérification en deux étapes"
      description="Saisissez le code affiché par votre application d’authentification."
    >
      <FormulaireCode />
      <p className="text-sm text-muted-foreground">
        <Link href="/connexion" className="underline underline-offset-4">
          Revenir à la connexion
        </Link>
      </p>
    </PageCentree>
  );
}
