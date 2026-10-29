import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { perimetreCourant } from '@/server/auth/gardes';

import { creerPatientAction } from '../actions';
import { FormulairePatient } from '../formulaire-patient';

export const metadata: Metadata = { title: 'Nouveau patient – HA-Gestion' };

export default async function PageNouveauPatient() {
  const { perimetre, centres } = await perimetreCourant();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau patient">
        Les doublons possibles (même NIR, ou même nom et même date de naissance) sont signalés avant
        la création.
      </EntetePage>
      <FormulairePatient
        action={creerPatientAction}
        centres={centres}
        centreParDefaut={perimetre.type === 'centre' ? perimetre.centreId : undefined}
      />
    </div>
  );
}
