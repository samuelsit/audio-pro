import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { listerCentres } from '@/server/services/centres';
import { listerAudiosSansFiche } from '@/server/services/praticiens';

import { creerPraticienAction } from '../actions';
import { FormulairePraticien } from '../formulaire-praticien';

export const metadata: Metadata = { title: 'Nouvelle fiche praticien – HA-Gestion' };

export default async function PageNouveauPraticien() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const [centres, audios] = await Promise.all([
    listerCentres(acteur, { type: 'tous' }),
    listerAudiosSansFiche(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvelle fiche praticien">
        {audios.length === 0
          ? 'Tous les audioprothésistes ont déjà une fiche. Créez d’abord un utilisateur de rôle Audioprothésiste.'
          : null}
      </EntetePage>
      <FormulairePraticien action={creerPraticienAction} centres={centres} audios={audios} />
    </div>
  );
}
