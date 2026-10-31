'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { EtatImportCsv } from '@/components/import-csv';
import { coche, liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { executerImportCsv } from '@/server/import-csv';
import { notifier } from '@/server/notifications';
import { creerModele, importerModelesCsv, modifierModele } from '@/server/services/catalogue';

function saisie(formData: FormData) {
  return {
    fabricantId: texte(formData, 'fabricantId'),
    gamme: texte(formData, 'gamme'),
    nom: texte(formData, 'nom'),
    type: texte(formData, 'type'),
    classe: texte(formData, 'classe'),
    codesLpp: texte(formData, 'codesLpp'),
    prixConseilleCentimes: texte(formData, 'prixConseilleCentimes'),
    marque: texte(formData, 'marque'),
    referenceCommerciale: texte(formData, 'referenceCommerciale'),
    lieuFabrication: texte(formData, 'lieuFabrication'),
    nombreCanaux: texte(formData, 'nombreCanaux'),
    connectivite: texte(formData, 'connectivite'),
    antiLarsen: texte(formData, 'antiLarsen'),
    reducteurAcouphenes: texte(formData, 'reducteurAcouphenes'),
    bobineT: texte(formData, 'bobineT'),
    options: liste(formData, 'options').join(' '),
    actif: coche(formData, 'actif'),
  };
}

async function terminer(): Promise<never> {
  revalidatePath('/admin/modeles');
  await notifier('Modèle enregistré.');
  redirect('/admin/modeles');
}

export async function creerModeleAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerModele(acteur, donnees), donnees);
  return erreur ?? terminer();
}

export async function modifierModeleAction(
  modeleId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierModele(acteur, modeleId, donnees), donnees);
  return erreur ?? terminer();
}

export async function importerModelesAction(
  _: EtatImportCsv,
  formData: FormData,
): Promise<EtatImportCsv> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const etat = await executerImportCsv(formData, (t) => importerModelesCsv(acteur, t));
  revalidatePath('/admin/modeles');
  return etat;
}
