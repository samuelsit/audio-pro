import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'À facturer – HA-Gestion' };

export default async function PageAFacturer() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="À facturer">Dossiers prêts à facturer et export vers Cosium.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible aux étapes 11 et 12 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
