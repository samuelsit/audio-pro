import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Tableau de bord – HA-Gestion' };

export default async function PageTableauDeBord() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Tableau de bord">Indicateurs du réseau et des centres.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 14 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
