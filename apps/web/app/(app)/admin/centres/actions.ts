'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { creerCentre, modifierCentre } from '@/server/services/centres';

function saisie(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    adresseLigne1: texte(formData, 'adresseLigne1'),
    adresseLigne2: texte(formData, 'adresseLigne2'),
    codePostal: texte(formData, 'codePostal'),
    ville: texte(formData, 'ville'),
    finess: texte(formData, 'finess'),
    numeroFacturationAm: texte(formData, 'numeroFacturationAm'),
    email: texte(formData, 'email'),
    telephone: texte(formData, 'telephone'),
    actif: coche(formData, 'actif'),
  };
}

export async function creerCentreAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerCentre(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/', 'layout');
  redirect('/admin/centres');
}

export async function modifierCentreAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierCentre(acteur, centreId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/', 'layout');
  redirect('/admin/centres');
}
