import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';

import { creerPrescripteurAction } from '../actions';
import { FormulairePrescripteur } from '../formulaire-prescripteur';

export const metadata: Metadata = { title: 'Nouveau prescripteur – HA-Gestion' };

export default function PageNouveauPrescripteur() {
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau prescripteur" />
      <FormulairePrescripteur action={creerPrescripteurAction} />
    </div>
  );
}
