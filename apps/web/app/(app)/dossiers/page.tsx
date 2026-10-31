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
      <EtatVide titre="Liste en préparation">
        Les dossiers s’ouvrent et se créent depuis l’onglet « Dossiers » de la fiche patient.
      </EtatVide>
    </div>
  );
}
