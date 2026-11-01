'use server';

import { revalidatePath } from 'next/cache';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import {
  changerAppareilEssai,
  confirmerAchat,
  enregistrerCompteRendu,
  enregistrerProlongation,
  planifierRdvEssai,
} from '@/server/services/essais';
import { envoyerCompteRenduAuPrescripteur, revoquerLien } from '@/server/services/liens-document';

/** L'écran reste sur le dossier : la confirmation s'affiche dans le formulaire (voir ADR-011). */
function terminer(dossierId: string, succes: string): EtatFormulaire {
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath('/essais');
  return { succes };
}

export async function planifierRdvEssaiAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    typeRdvId: texte(formData, 'typeRdvId'),
    date: texte(formData, 'date'),
    heure: texte(formData, 'heure'),
    confirmerHorsDisponibilites: coche(formData, 'confirmerHorsDisponibilites'),
  };
  const erreur = await executer(() => planifierRdvEssai(acteur, dossierId, donnees), donnees);
  return erreur ?? terminer(dossierId, 'Rendez-vous planifié dans l’agenda.');
}

export async function enregistrerCompteRenduAction(
  dossierId: string,
  rendezVousId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { compteRendu: texte(formData, 'compteRendu') };
  const erreur = await executer(
    () => enregistrerCompteRendu(acteur, rendezVousId, donnees),
    donnees,
  );
  return erreur ?? terminer(dossierId, 'Compte rendu enregistré.');
}

export async function envoyerCompteRenduAction(dossierId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => envoyerCompteRenduAuPrescripteur(acteur, dossierId));
  return erreur ?? terminer(dossierId, 'Lien envoyé au prescripteur.');
}

export async function revoquerLienAction(
  dossierId: string,
  lienId: string,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => revoquerLien(acteur, lienId));
  return erreur ?? terminer(dossierId, 'Lien révoqué.');
}

export async function prolongerEssaiAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    dateDemande: texte(formData, 'dateDemande'),
    jours: texte(formData, 'jours'),
    motif: texte(formData, 'motif'),
  };
  const fichier = formData.get('justificatif');
  const justificatif =
    fichier instanceof File ? new Uint8Array(await fichier.arrayBuffer()) : new Uint8Array(0);
  const erreur = await executer(
    () => enregistrerProlongation(acteur, dossierId, donnees, justificatif),
    donnees,
  );
  return erreur ?? terminer(dossierId, 'Prolongation enregistrée.');
}

export async function changerAppareilAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    statutAttendu: texte(formData, 'statutAttendu'),
    oreille: texte(formData, 'oreille'),
    numeroSerie: texte(formData, 'numeroSerie'),
    motifRetrait: texte(formData, 'motifRetrait'),
  };
  const erreur = await executer(() => changerAppareilEssai(acteur, dossierId, donnees), donnees);
  return erreur ?? terminer(dossierId, 'Appareil changé.');
}

export async function confirmerAchatAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { statutAttendu: texte(formData, 'statutAttendu') };
  const erreur = await executer(() => confirmerAchat(acteur, dossierId, donnees), donnees);
  return erreur ?? terminer(dossierId, 'Achat confirmé : dossier à facturer.');
}
