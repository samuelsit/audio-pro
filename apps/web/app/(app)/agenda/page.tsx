import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Agenda – HA-Gestion' };

export default async function PageAgenda() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Agenda">Agenda multi-centres et rendez-vous.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 7 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
