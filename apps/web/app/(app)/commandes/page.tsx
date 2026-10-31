import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Commandes – HA-Gestion' };

export default async function PageCommandes() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Commandes">Commandes fabricants et réceptions.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 17 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
