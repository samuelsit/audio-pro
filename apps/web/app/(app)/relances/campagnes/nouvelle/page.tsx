import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { centresSelectionnables } from '@/server/auth/acces';
import { requireRole } from '@/server/auth/gardes';
import { listerModelesCampagne } from '@/server/services/communication';

import { campagneAction, compterSegmentAction } from '../../actions';
import { FormulaireCampagne } from '../../formulaires';

export const metadata: Metadata = { title: 'Nouvelle campagne – HA-Gestion' };

export default async function PageNouvelleCampagne() {
  const acteur = await requireRole('ADMIN_CLIENT', 'RESPONSABLE_CENTRE');
  const [centres, modeles] = await Promise.all([
    centresSelectionnables(acteur),
    listerModelesCampagne(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvelle campagne" />
      {modeles.length === 0 ? (
        <EtatVide titre="Aucun modèle de campagne">
          Un administrateur doit d’abord en créer un dans Administration, Communication.
        </EtatVide>
      ) : (
        <FormulaireCampagne
          action={campagneAction}
          compter={compterSegmentAction}
          centres={centres}
          modeles={modeles}
        />
      )}
    </div>
  );
}
