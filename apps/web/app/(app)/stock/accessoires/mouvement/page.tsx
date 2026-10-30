import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerAccessoires } from '@/server/services/catalogue';
import { centresDeDestination } from '@/server/services/stock';

import { FormulaireMouvementAccessoire } from './formulaire-mouvement-accessoire';

export const metadata: Metadata = { title: 'Mouvement d’accessoires – HA-Gestion' };

export default async function PageMouvementAccessoire() {
  const { acteur, perimetre, centres } = await perimetreCourant();
  const [accessoires, destinations] = await Promise.all([
    listerAccessoires(acteur),
    centresDeDestination(acteur, null),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Mouvement d’accessoires">
        Entrée, sortie ou transfert vers un autre centre.
      </EntetePage>
      <FormulaireMouvementAccessoire
        centres={centres}
        centreId={perimetre.type === 'centre' ? perimetre.centreId : undefined}
        destinations={destinations}
        accessoires={accessoires.filter((a) => a.actif)}
      />
    </div>
  );
}
