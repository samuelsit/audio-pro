import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { donneesCreationDossier, lireOrigineDossier } from '@/server/services/dossiers';
import { obtenirPatient } from '@/server/services/patients';

import { FormulaireDossier } from '../../../../dossiers/formulaire-dossier';
import { EntetePatient } from '../../../entete-patient';

export const metadata: Metadata = { title: 'Nouveau dossier – HA-Gestion' };

export default async function PageNouveauDossier({
  params,
  searchParams,
}: PageProps<'/patients/[id]/dossiers/nouveau'>) {
  const { id } = await params;
  const { rdv, bilan } = await searchParams;
  const acteur = await requireSession();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}/dossiers/nouveau`);
  }
  const { fiche } = ouverture;
  const origine = await lireOrigineDossier(acteur, fiche.id, {
    rdv: typeof rdv === 'string' ? rdv : undefined,
    bilan: typeof bilan === 'string' ? bilan : undefined,
  });
  const donnees = await donneesCreationDossier(acteur, fiche, origine);

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} titre="Nouveau dossier d’appareillage" />
      <FormulaireDossier patientId={fiche.id} donnees={donnees} origine={origine} />
    </div>
  );
}
