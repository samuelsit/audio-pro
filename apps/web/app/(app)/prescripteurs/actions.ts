'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole, requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  changerActivationPrescripteur,
  creerPrescripteur,
  modifierPrescripteur,
  rechercherPrescripteurs,
  type PrescripteurResume,
} from '@/server/services/prescripteurs';

function saisie(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    prenom: texte(formData, 'prenom'),
    rpps: texte(formData, 'rpps'),
    specialite: texte(formData, 'specialite'),
    formationOtologie: texte(formData, 'formationOtologie'),
    cabinet: texte(formData, 'cabinet'),
    contact: texte(formData, 'contact'),
  };
}

export async function creerPrescripteurAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisie(formData);
  const erreur = await executer(() => creerPrescripteur(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/prescripteurs');
  await notifier('Prescripteur enregistré.');
  redirect('/prescripteurs');
}

export async function modifierPrescripteurAction(
  prescripteurId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(
    () => modifierPrescripteur(acteur, prescripteurId, donnees),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  revalidatePath('/prescripteurs');
  await notifier('Prescripteur enregistré.');
  redirect('/prescripteurs');
}

export async function changerActivationPrescripteurAction(
  prescripteurId: string,
  actif: boolean,
): Promise<void> {
  const acteur = await requireRole('ADMIN_CLIENT');
  await changerActivationPrescripteur(acteur, prescripteurId, actif);
  revalidatePath('/prescripteurs');
  await notifier(actif ? 'Prescripteur réactivé.' : 'Prescripteur désactivé.');
  redirect('/prescripteurs');
}

/** Suggestions du sélecteur de prescripteur. */
export async function rechercherPrescripteursAction(q: string): Promise<PrescripteurResume[]> {
  const acteur = await requireSession();
  return rechercherPrescripteurs(acteur, q);
}

export interface EtatCreationVolee extends EtatFormulaire {
  cree?: PrescripteurResume;
}

/** Création à la volée : ne quitte pas la page, renvoie la fiche pour la sélectionner. */
export async function creerPrescripteurVoleeAction(
  _: EtatCreationVolee,
  formData: FormData,
): Promise<EtatCreationVolee> {
  const acteur = await requireSession();
  const donnees = saisie(formData);
  let cree: PrescripteurResume | undefined;
  const erreur = await executer(async () => {
    cree = await creerPrescripteur(acteur, donnees);
  }, donnees);
  revalidatePath('/prescripteurs');
  return erreur ?? (cree ? { cree } : {});
}
