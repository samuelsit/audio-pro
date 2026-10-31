'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { basculerModele, enregistrerModele } from '@/server/services/modeles-formulaire';

function definitionSaisie(formData: FormData): unknown {
  try {
    return JSON.parse(texte(formData, 'definition'));
  } catch {
    return null;
  }
}

export async function enregistrerModeleAction(
  code: string | null,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const saisie = {
    nature: texte(formData, 'nature'),
    nom: texte(formData, 'nom'),
    definition: definitionSaisie(formData),
  };
  const etat = await executer(() => enregistrerModele(acteur, code, saisie));
  if (etat) {
    return etat;
  }
  revalidatePath('/admin/formulaires');
  await notifier('Modèle enregistré.');
  redirect('/admin/formulaires');
}

export async function basculerModeleAction(code: string, actif: boolean): Promise<void> {
  const acteur = await requireRole('ADMIN_CLIENT');
  await basculerModele(acteur, code, actif);
  revalidatePath('/admin/formulaires');
  await notifier(actif ? 'Modèle rétabli.' : 'Modèle retiré des propositions.');
}
