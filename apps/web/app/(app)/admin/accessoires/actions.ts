'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { EtatImportCsv } from '@/components/import-csv';
import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { executerImportCsv } from '@/server/import-csv';
import { notifier } from '@/server/notifications';
import {
  creerAccessoire,
  importerAccessoiresCsv,
  modifierAccessoire,
} from '@/server/services/catalogue';

function saisie(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    nature: texte(formData, 'nature'),
    codeLpp: texte(formData, 'codeLpp'),
    prixCentimes: texte(formData, 'prixCentimes'),
    prixAchatCentimes: texte(formData, 'prixAchatCentimes'),
    marque: texte(formData, 'marque'),
    referenceCommerciale: texte(formData, 'referenceCommerciale'),
    actif: coche(formData, 'actif'),
  };
}

async function terminer(): Promise<never> {
  revalidatePath('/admin/accessoires');
  await notifier('Accessoire enregistré.');
  redirect('/admin/accessoires');
}

export async function creerAccessoireAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerAccessoire(acteur, donnees), donnees);
  return erreur ?? terminer();
}

export async function modifierAccessoireAction(
  accessoireId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierAccessoire(acteur, accessoireId, donnees), donnees);
  return erreur ?? terminer();
}

export async function importerAccessoiresAction(
  _: EtatImportCsv,
  formData: FormData,
): Promise<EtatImportCsv> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const etat = await executerImportCsv(formData, (t) => importerAccessoiresCsv(acteur, t));
  revalidatePath('/admin/accessoires');
  return etat;
}
