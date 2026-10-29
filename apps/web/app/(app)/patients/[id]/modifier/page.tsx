import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ouIntrouvable, perimetreCourant } from '@/server/auth/gardes';
import { obtenirPatient } from '@/server/services/patients';

import { modifierPatientAction } from '../../actions';
import { identiteComplete } from '../../affichage';
import { EntetePatient } from '../../entete-patient';
import { FormulairePatient } from '../../formulaire-patient';

export const metadata: Metadata = { title: 'Modifier un patient – HA-Gestion' };

export default async function PageModifierPatient({
  params,
}: PageProps<'/patients/[id]/modifier'>) {
  const { id } = await params;
  const { acteur, centres } = await perimetreCourant();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}/modifier`);
  }
  const { fiche } = ouverture;
  // Le centre actuel reste proposé même s'il n'est plus sélectionnable (centre désactivé).
  const options = centres.some((c) => c.id === fiche.centre.id)
    ? centres
    : [fiche.centre, ...centres];
  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} titre={`Modifier : ${identiteComplete(fiche)}`} />
      <FormulairePatient
        action={modifierPatientAction.bind(null, id)}
        centres={options}
        patient={fiche}
      />
    </div>
  );
}
