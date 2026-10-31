'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { creerFabricant, modifierFabricant } from '@/server/services/catalogue';

function saisie(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    adresse: texte(formData, 'adresse'),
    mandataire: texte(formData, 'mandataire'),
    actif: coche(formData, 'actif'),
  };
}

async function terminer(): Promise<never> {
  revalidatePath('/admin/fabricants');
  await notifier('Fabricant enregistré.');
  redirect('/admin/fabricants');
}

export async function creerFabricantAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerFabricant(acteur, donnees), donnees);
  return erreur ?? terminer();
}

export async function modifierFabricantAction(
  fabricantId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierFabricant(acteur, fabricantId, donnees), donnees);
  return erreur ?? terminer();
}
