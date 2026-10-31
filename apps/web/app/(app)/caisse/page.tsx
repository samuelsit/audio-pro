import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Caisse – HA-Gestion' };

export default async function PageCaisse() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Caisse">Encaissements et clôtures.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 15 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
