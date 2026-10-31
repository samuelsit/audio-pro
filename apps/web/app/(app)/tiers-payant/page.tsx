import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Tiers payant – HA-Gestion' };

export default async function PageTierspayant() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Tiers payant">Prises en charge et créances.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 16 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
