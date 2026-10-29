import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';

import { creerCentreAction } from '../actions';
import { FormulaireCentre } from '../formulaire-centre';

export const metadata: Metadata = { title: 'Nouveau centre – HA-Gestion' };

export default function PageNouveauCentre() {
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau centre" />
      <FormulaireCentre action={creerCentreAction} />
    </div>
  );
}
