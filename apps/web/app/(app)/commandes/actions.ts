'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import type { UtilisateurConnecte } from '@/server/auth/acces';
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
import { saisirAccuse, transmettreCommande } from '@/server/services/envoi-commandes';

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

/** L'envoi suit l'approbation. S'il échoue, la commande reste approuvée et se renvoie depuis son écran. */
async function envoyer(acteur: UtilisateurConnecte, commandeId: string): Promise<void> {
  const erreur = await executer(() => transmettreCommande(acteur, commandeId));
  await notifier(
    erreur ? `Commande approuvée, non envoyée : ${erreur.message ?? ''}` : 'Commande envoyée.',
    erreur ? 'erreur' : 'succes',
  );
}

export async function soumettreCommandeAction(commandeId: string): Promise<void> {
  const acteur = await requireSession();
  let statut = 'BROUILLON';
  const erreur = await executer(async () => {
    statut = await soumettreCommande(acteur, commandeId);
  });
  if (!erreur && statut === 'APPROUVEE') {
    await envoyer(acteur, commandeId);
  } else {
    await notifier(erreur?.message ?? 'Demande à approuver.', erreur ? 'erreur' : 'succes');
  }
  actualiser(commandeId);
}

export async function approuverCommandeAction(commandeId: string): Promise<void> {
  const acteur = await requireSession();
  const erreur = await executer(() => approuverCommande(acteur, commandeId));
  if (erreur) {
    await notifier(erreur.message ?? 'Approbation impossible.', 'erreur');
  } else {
    await envoyer(acteur, commandeId);
  }
  actualiser(commandeId);
}

export async function transmettreCommandeAction(commandeId: string): Promise<void> {
  const acteur = await requireSession();
  await envoyer(acteur, commandeId);
  actualiser(commandeId);
}

export async function saisirAccuseAction(
  commandeId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { referenceFournisseur: texte(formData, 'referenceFournisseur') };
  const erreur = await executer(() => saisirAccuse(acteur, commandeId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  actualiser(commandeId);
  return { succes: 'Accusé enregistré.' };
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
