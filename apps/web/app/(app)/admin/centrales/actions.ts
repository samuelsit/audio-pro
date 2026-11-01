'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { creerCentrale, modifierCentrale } from '@/server/services/fournisseurs';

function saisie(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    email: texte(formData, 'email'),
    telephone: texte(formData, 'telephone'),
    adresse: texte(formData, 'adresse'),
    actif: coche(formData, 'actif'),
  };
}

async function terminer(): Promise<never> {
  revalidatePath('/admin/centrales');
  await notifier('Centrale enregistrée.');
  redirect('/admin/centrales');
}

export async function creerCentraleAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerCentrale(acteur, donnees), donnees);
  return erreur ?? terminer();
}

export async function modifierCentraleAction(
  centraleId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierCentrale(acteur, centraleId, donnees), donnees);
  return erreur ?? terminer();
}
