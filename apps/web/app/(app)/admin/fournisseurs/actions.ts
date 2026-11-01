'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  ajouterContact,
  creerFournisseur,
  enregistrerComptes,
  modifierFournisseur,
  retirerContact,
} from '@/server/services/fournisseurs';

function saisie(formData: FormData) {
  return {
    type: texte(formData, 'type'),
    nom: texte(formData, 'nom'),
    fabricantId: texte(formData, 'fabricantId'),
    centraleAchatId: texte(formData, 'centraleAchatId'),
    emailCommande: texte(formData, 'emailCommande'),
    emailFacturation: texte(formData, 'emailFacturation'),
    telephone: texte(formData, 'telephone'),
    adresse: texte(formData, 'adresse'),
    siret: texte(formData, 'siret'),
    conditions: texte(formData, 'conditions'),
    delaiRelanceJours: texte(formData, 'delaiRelanceJours'),
    actif: coche(formData, 'actif'),
  };
}

async function terminer(): Promise<never> {
  revalidatePath('/admin/fournisseurs');
  await notifier('Fournisseur enregistré.');
  redirect('/admin/fournisseurs');
}

export async function creerFournisseurAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerFournisseur(acteur, donnees), donnees);
  return erreur ?? terminer();
}

export async function modifierFournisseurAction(
  fournisseurId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierFournisseur(acteur, fournisseurId, donnees), donnees);
  return erreur ?? terminer();
}

export async function ajouterContactAction(
  fournisseurId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = {
    nom: texte(formData, 'nom'),
    fonction: texte(formData, 'fonction'),
    email: texte(formData, 'email'),
    telephone: texte(formData, 'telephone'),
  };
  const erreur = await executer(() => ajouterContact(acteur, fournisseurId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(`/admin/fournisseurs/${fournisseurId}`);
  await notifier('Contact ajouté.');
  return {};
}

export async function retirerContactAction(
  fournisseurId: string,
  contactId: string,
): Promise<void> {
  const acteur = await requireRole('ADMIN_CLIENT');
  await retirerContact(acteur, fournisseurId, contactId);
  revalidatePath(`/admin/fournisseurs/${fournisseurId}`);
}

export async function enregistrerComptesAction(
  fournisseurId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const comptes = [...formData.keys()]
    .filter((cle) => cle.startsWith('compte-'))
    .map((cle) => ({ centreId: cle.slice('compte-'.length), numeroClient: texte(formData, cle) }));
  const erreur = await executer(() => enregistrerComptes(acteur, fournisseurId, comptes), {});
  if (erreur) {
    return erreur;
  }
  revalidatePath(`/admin/fournisseurs/${fournisseurId}`);
  await notifier('Numéros de client enregistrés.');
  return {};
}
