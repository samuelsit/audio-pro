'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  ajouterLigne,
  annulerCommande,
  approuverCommande,
  cloturerCommande,
  creerCommande,
  fixerPrixLigne,
  refuserCommande,
  retirerLigne,
  soumettreCommande,
} from '@/server/services/commandes';

function actualiser(commandeId: string): void {
  revalidatePath('/commandes');
  revalidatePath(`/commandes/${commandeId}`);
}

export async function creerCommandeAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    centreId: texte(formData, 'centreId'),
    fournisseurId: texte(formData, 'fournisseurId'),
  };
  let id = '';
  const erreur = await executer(async () => {
    id = await creerCommande(acteur, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/commandes');
  redirect(`/commandes/${id}`);
}

export async function ajouterLigneAction(
  commandeId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    produit: texte(formData, 'produit'),
    quantite: texte(formData, 'quantite'),
    prixAchatCentimes: texte(formData, 'prixAchatCentimes'),
    enConsignation: coche(formData, 'enConsignation'),
    patientId: texte(formData, 'patientId'),
    oreille: texte(formData, 'oreille'),
  };
  const erreur = await executer(() => ajouterLigne(acteur, commandeId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  actualiser(commandeId);
  return { succes: 'Ligne ajoutée.' };
}

export async function retirerLigneAction(commandeId: string, ligneId: string): Promise<void> {
  const acteur = await requireSession();
  await retirerLigne(acteur, commandeId, ligneId);
  actualiser(commandeId);
}

export async function fixerPrixLigneAction(
  commandeId: string,
  ligneId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { prixAchatCentimes: texte(formData, 'prixAchatCentimes') };
  const erreur = await executer(
    () => fixerPrixLigne(acteur, commandeId, ligneId, donnees),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  actualiser(commandeId);
  return { succes: 'Prix enregistré.' };
}

export async function soumettreCommandeAction(commandeId: string): Promise<void> {
  const acteur = await requireSession();
  const erreur = await executer(() => soumettreCommande(acteur, commandeId));
  await notifier(erreur?.message ?? 'Commande soumise.', erreur ? 'erreur' : 'succes');
  actualiser(commandeId);
}

export async function approuverCommandeAction(commandeId: string): Promise<void> {
  const acteur = await requireSession();
  const erreur = await executer(() => approuverCommande(acteur, commandeId));
  await notifier(erreur?.message ?? 'Commande approuvée.', erreur ? 'erreur' : 'succes');
  actualiser(commandeId);
}

export async function cloturerCommandeAction(commandeId: string): Promise<void> {
  const acteur = await requireSession();
  const erreur = await executer(() => cloturerCommande(acteur, commandeId));
  await notifier(erreur?.message ?? 'Commande close.', erreur ? 'erreur' : 'succes');
  actualiser(commandeId);
}

export async function refuserCommandeAction(
  commandeId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(() => refuserCommande(acteur, commandeId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  actualiser(commandeId);
  return { succes: 'Demande renvoyée en brouillon.' };
}

export async function annulerCommandeAction(
  commandeId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(() => annulerCommande(acteur, commandeId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  actualiser(commandeId);
  return { succes: 'Commande annulée.' };
}
