import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { requireSession } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Patients – HA-Gestion' };

export default async function PagePatients() {
  await requireSession();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Patients">Fiches patients, carte Vitale, droits et historique.</EntetePage>
      <EtatVide titre="Écran en préparation">
        Disponible à l’étape 3 du plan de réalisation.
      </EtatVide>
    </div>
  );
}
