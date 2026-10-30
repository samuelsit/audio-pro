import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';

import { creerAccessoireAction } from '../actions';
import { FormulaireAccessoire } from '../formulaire-accessoire';

export const metadata: Metadata = { title: 'Nouvel accessoire – HA-Gestion' };

export default function PageNouvelAccessoire() {
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvel accessoire" />
      <FormulaireAccessoire action={creerAccessoireAction} />
    </div>
  );
}
