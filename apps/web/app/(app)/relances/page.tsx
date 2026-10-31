import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Relances – HA-Gestion' };

export default async function PageRelances() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Relances">Rappels et campagnes.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 19 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
