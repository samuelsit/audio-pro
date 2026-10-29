'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { creerPraticien, modifierPraticien } from '@/server/services/praticiens';

function saisie(formData: FormData) {
  return {
    utilisateurId: texte(formData, 'utilisateurId'),
    rpps: texte(formData, 'rpps'),
    adeli: texte(formData, 'adeli'),
    centreIds: liste(formData, 'centreIds'),
  };
}

export async function creerPraticienAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerPraticien(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/praticiens');
  redirect('/admin/praticiens');
}

export async function modifierPraticienAction(
  praticienId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierPraticien(acteur, praticienId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/praticiens');
  redirect('/admin/praticiens');
}
