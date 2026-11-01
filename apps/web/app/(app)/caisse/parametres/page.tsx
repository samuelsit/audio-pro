import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ouIntrouvable } from '@/server/auth/gardes';
import { obtenirParametresComptables } from '@/server/services/caisse';

import { centreDeCaisse, ChoisirUnCentre } from '../centre';
import { FormulaireParametres } from './formulaire';

export const metadata: Metadata = { title: 'Paramètres de caisse – HA-Gestion' };

export default async function PageParametres() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  const parametres = await ouIntrouvable(obtenirParametresComptables(acteur, centreId));
  return (
    <div className="grid gap-6">
      <EntetePage titre="Paramètres de caisse">
        Plan de comptes, format d’export et fin d’exercice du centre.
      </EntetePage>
      <Alert>
        <AlertTitle>Valeurs à faire valider par l’expert-comptable</AlertTitle>
        <AlertDescription>
          Les comptes proposés par défaut sont un point de départ. Tout changement est inscrit au
          journal de caisse.
        </AlertDescription>
      </Alert>
      <FormulaireParametres centreId={centreId} parametres={parametres} />
    </div>
  );
}
