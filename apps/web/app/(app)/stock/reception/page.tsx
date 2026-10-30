import { SystemClock } from '@ha/adapters';
import { peutVoirPrixAchat } from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerModeles } from '@/server/services/catalogue';

import { FormulaireReception } from './formulaire-reception';

export const metadata: Metadata = { title: 'Réception – HA-Gestion' };

export default async function PageReception() {
  const { acteur, perimetre, centres } = await perimetreCourant();
  const modeles = await listerModeles(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Réception d’appareils">
        Un modèle et un bon de livraison : scannez ensuite les numéros de série à la suite.
      </EntetePage>
      <FormulaireReception
        centres={centres}
        centreId={perimetre.type === 'centre' ? perimetre.centreId : undefined}
        modeles={modeles.filter((m) => m.actif)}
        aujourdhui={new SystemClock().now().slice(0, 10)}
        saisitPrix={peutVoirPrixAchat(acteur.role)}
      />
    </div>
  );
}
