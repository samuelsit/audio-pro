'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { listerPatients, type PatientResume } from '@/server/services/patients';
import { recevoirAppareils } from '@/server/services/reception';
import {
  annulerVente,
  changerStatut,
  entreeAccessoire,
  modifierAppareil,
  sortieAccessoire,
  transfererAccessoire,
  transfererAppareil,
} from '@/server/services/stock';

const LISTE = '/stock';
const accesFiche = (id: string) => `/stock/appareils/${id}`;
const ACCESSOIRES = '/stock/accessoires';

export async function recevoirAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    centreId: texte(formData, 'centreId'),
    modeleId: texte(formData, 'modeleId'),
    numerosSerie: liste(formData, 'numerosSerie'),
    referenceBonLivraison: texte(formData, 'referenceBonLivraison'),
    referenceFactureFabricant: texte(formData, 'referenceFactureFabricant'),
    dateReception: texte(formData, 'dateReception'),
    prixAchatCentimes: texte(formData, 'prixAchatCentimes'),
    enConsignation: coche(formData, 'enConsignation'),
  };
  const erreur = await executer(() => recevoirAppareils(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(LISTE);
  await notifier(`${donnees.numerosSerie.length} appareil(s) reçu(s).`);
  redirect(LISTE);
}

async function terminerMouvement(appareilId: string): Promise<never> {
  revalidatePath(LISTE);
  await notifier('Mouvement enregistré.');
  redirect(accesFiche(appareilId));
}

export async function changerStatutAction(
  appareilId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    statut: texte(formData, 'statut'),
    statutAttendu: texte(formData, 'statutAttendu'),
    patientId: texte(formData, 'patientId'),
    motif: texte(formData, 'motif'),
  };
  const erreur = await executer(() => changerStatut(acteur, appareilId, donnees), donnees);
  return erreur ?? terminerMouvement(appareilId);
}

export async function transfererAction(
  appareilId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    centreDestinationId: texte(formData, 'centreDestinationId'),
    centreOrigineId: texte(formData, 'centreOrigineId'),
    motif: texte(formData, 'motif'),
  };
  const erreur = await executer(() => transfererAppareil(acteur, appareilId, donnees), donnees);
  return erreur ?? terminerMouvement(appareilId);
}

export async function annulerVenteAction(
  appareilId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(() => annulerVente(acteur, appareilId, donnees), donnees);
  return erreur ?? terminerMouvement(appareilId);
}

export async function modifierAppareilAction(
  appareilId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    referenceBonLivraison: texte(formData, 'referenceBonLivraison'),
    referenceFactureFabricant: texte(formData, 'referenceFactureFabricant'),
    prixAchatCentimes: texte(formData, 'prixAchatCentimes'),
    enConsignation: coche(formData, 'enConsignation'),
    // Champs présents seulement quand la correction est possible.
    ...(formData.has('numeroSerie') ? { numeroSerie: texte(formData, 'numeroSerie') } : {}),
    ...(formData.has('modeleId') ? { modeleId: texte(formData, 'modeleId') } : {}),
  };
  const erreur = await executer(() => modifierAppareil(acteur, appareilId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(LISTE);
  await notifier('Appareil enregistré.');
  redirect(accesFiche(appareilId));
}

/** Patients du centre de l'appareil proposés par le sélecteur : aucune fiche n'est ouverte. */
export async function rechercherPatientsAction(
  centreId: string,
  nom: string,
): Promise<PatientResume[]> {
  const acteur = await requireSession();
  return (await listerPatients(acteur, { type: 'centre', centreId }, { nom })).patients;
}

export async function mouvementAccessoireAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const type = texte(formData, 'type');
  const donnees = {
    type,
    centreId: texte(formData, 'centreId'),
    accessoireId: texte(formData, 'accessoireId'),
    quantite: texte(formData, 'quantite'),
    motif: texte(formData, 'motif'),
    centreDestinationId: texte(formData, 'centreDestinationId'),
  };
  const operations: Record<string, () => Promise<void>> = {
    ENTREE: () => entreeAccessoire(acteur, donnees),
    SORTIE: () => sortieAccessoire(acteur, donnees),
    TRANSFERT: () => transfererAccessoire(acteur, donnees),
  };
  const operation = operations[type];
  if (!operation) {
    return { message: 'Type de mouvement inconnu.', valeurs: donnees };
  }
  const erreur = await executer(operation, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(ACCESSOIRES);
  await notifier('Mouvement enregistré.');
  redirect(ACCESSOIRES);
}
