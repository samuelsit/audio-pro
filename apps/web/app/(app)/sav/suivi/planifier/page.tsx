import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { creneauxPourControle } from '@/server/services/suivi';

import { FormulaireIgnorer, FormulairePlanification } from '../../formulaires';

export const metadata: Metadata = { title: 'Proposer un contrôle – HA-Gestion' };

export default async function PagePlanifier({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const { patient, reference, rang, prevue, centre, type } = premieresValeurs(await searchParams);
  if (!patient || !reference || !rang || !prevue) {
    notFound();
  }
  const proposition = await ouIntrouvable(
    creneauxPourControle(acteur, patient, {
      datePrevue: prevue,
      typeRdvId: type,
      centreId: centre,
    }),
  );
  const controle = { patientId: patient, dateReference: reference, rang };
  return (
    <div className="grid gap-6">
      <EntetePage titre="Proposer un contrôle">Prévu le {formaterDate(prevue)}.</EntetePage>
      <FormulairePlanification
        controle={controle}
        centreId={proposition.centreId}
        typeRdvId={proposition.typeRdvId}
        creneaux={proposition.creneaux}
      />
      <FormulaireIgnorer controle={controle} />
    </div>
  );
}
