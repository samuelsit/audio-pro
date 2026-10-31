import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'SAV – HA-Gestion' };

export default async function PageSAV() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="SAV">Réparations, garanties et prêts.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 18 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
