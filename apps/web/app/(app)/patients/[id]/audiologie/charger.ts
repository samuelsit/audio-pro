import { redirect } from 'next/navigation';

import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { obtenirBilan } from '@/server/services/audiologie';

/** Ouvre le bilan (une ligne READ) ; une ancienne adresse suit le patient après une fusion. */
export async function chargerBilan(patientId: string, bilanId: string) {
  const acteur = await requireSession();
  const bilan = await ouIntrouvable(obtenirBilan(acteur, bilanId));
  if (bilan.patientId !== patientId) {
    redirect(`/patients/${bilan.patientId}/audiologie/${bilanId}`);
  }
  return { acteur, bilan };
}
