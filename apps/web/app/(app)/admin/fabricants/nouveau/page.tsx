import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';

import { creerFabricantAction } from '../actions';
import { FormulaireFabricant } from '../formulaire-fabricant';

export const metadata: Metadata = { title: 'Nouveau fabricant – HA-Gestion' };

export default function PageNouveauFabricant() {
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau fabricant" />
      <FormulaireFabricant action={creerFabricantAction} />
    </div>
  );
}
