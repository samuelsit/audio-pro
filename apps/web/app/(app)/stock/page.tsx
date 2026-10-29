import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Stock – HA-Gestion' };

export default async function PageStock() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Stock">Appareils, accessoires et numéros de série par centre.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 7 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
