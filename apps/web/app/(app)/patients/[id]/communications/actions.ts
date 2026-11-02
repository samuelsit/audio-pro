'use server';

import { revalidatePath } from 'next/cache';

import { liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { noterConsentement } from '@/server/services/consentements';

export async function noterConsentementAction(
  patientId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const saisie = { canal: texte(formData, 'canal'), finalites: liste(formData, 'finalites') };
  const erreur = await executer(() => noterConsentement(acteur, patientId, saisie));
  if (erreur) {
    return erreur;
  }
  revalidatePath(`/patients/${patientId}/communications`);
  await notifier('Consentement noté.');
  return {};
}
