import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerModeles } from '@/server/services/catalogue';
import { obtenirFicheAppareil } from '@/server/services/stock';

import { modifierAppareilAction } from '../../../actions';
import { FormulaireAppareil } from './formulaire-appareil';

export const metadata: Metadata = { title: 'Modifier un appareil – HA-Gestion' };

export default async function PageModifierAppareil({
  params,
}: PageProps<'/stock/appareils/[id]/modifier'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const fiche = await ouIntrouvable(obtenirFicheAppareil(acteur, id));
  const modeles = fiche.corrigeable ? await listerModeles(acteur) : [];
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Modifier ${fiche.numeroSerie}`}>
        {fiche.corrigeable
          ? 'Tant que l’appareil n’a pas bougé, son numéro de série et son modèle restent corrigeables.'
          : 'Références d’achat de l’appareil.'}
      </EntetePage>
      <FormulaireAppareil
        action={modifierAppareilAction.bind(null, id)}
        fiche={fiche}
        modeles={modeles.filter((m) => m.actif)}
      />
    </div>
  );
}
