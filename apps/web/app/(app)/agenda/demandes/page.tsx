import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerDemandesEnLigne } from '@/server/services/agenda';

import { centreDeLAgenda } from '../centre';
import { DemandesClient } from './demandes-client';

export const metadata: Metadata = { title: 'Demandes en ligne – HA-Gestion' };

export default async function PageDemandesEnLigne({ searchParams }: PageProps<'/agenda/demandes'>) {
  const acteur = await requireSession();
  const { centre } = await searchParams;
  const { centreId } = await centreDeLAgenda(typeof centre === 'string' ? centre : undefined);
  if (centreId === null) {
    return <EtatVide titre="Aucun centre">Aucun centre n’est accessible.</EtatVide>;
  }
  const demandes = await ouIntrouvable(listerDemandesEnLigne(acteur, centreId));
  return (
    <div className="grid gap-4">
      <EntetePage titre="Demandes en ligne">
        Rendez-vous réservés par les patients, en attente de votre validation.
      </EntetePage>
      {demandes.length === 0 ? (
        <EtatVide titre="Aucune demande">Aucune demande n’attend de validation.</EtatVide>
      ) : (
        <DemandesClient demandes={demandes} />
      )}
    </div>
  );
}
