import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { lireParametresSav } from '@/server/services/garanties';
import { listerParc } from '@/server/services/prets';

import { FormulairePret } from '../../formulaires';

export const metadata: Metadata = { title: 'Nouveau prêt – HA-Gestion' };

export default async function PageNouveauPret({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { appareil: appareilId } = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  const [parc, { pretDureeJours }] = await Promise.all([
    listerParc(acteur, perimetre),
    lireParametresSav(acteur),
  ]);
  const appareil = parc.find((a) => a.id === appareilId && a.statut === 'EN_STOCK');
  if (!appareil) {
    redirect('/sav/prets');
  }
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau prêt">
        {appareil.designation}, série {appareil.numeroSerie}
      </EntetePage>
      <FormulairePret
        appareilId={appareil.id}
        centreId={appareil.centreId}
        dureeJours={pretDureeJours}
      />
    </div>
  );
}
