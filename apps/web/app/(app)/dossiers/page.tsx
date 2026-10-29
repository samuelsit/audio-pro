import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Dossiers – HA-Gestion' };

export default async function PageDossiers() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Dossiers">
        Dossiers d’appareillage : prescription, devis normalisé, essai.
      </EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible aux étapes 8 à 10 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
