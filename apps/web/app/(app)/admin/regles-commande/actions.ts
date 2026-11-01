'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { creerRegleCommande, modifierRegleCommande } from '@/server/services/regles-commande';

function saisie(formData: FormData) {
  return {
    libelle: texte(formData, 'libelle'),
    priorite: texte(formData, 'priorite'),
    montantMaxCentimes: texte(formData, 'montantMaxCentimes'),
    typeProduit: texte(formData, 'typeProduit'),
    fournisseurId: texte(formData, 'fournisseurId'),
    centreId: texte(formData, 'centreId'),
    decision: texte(formData, 'decision'),
    actif: coche(formData, 'actif'),
  };
}

async function terminer(): Promise<never> {
  revalidatePath('/admin/regles-commande');
  await notifier('Règle enregistrée.');
  redirect('/admin/regles-commande');
}

export async function creerRegleAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerRegleCommande(acteur, donnees), donnees);
  return erreur ?? terminer();
}

export async function modifierRegleAction(
  regleId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierRegleCommande(acteur, regleId, donnees), donnees);
  return erreur ?? terminer();
}
