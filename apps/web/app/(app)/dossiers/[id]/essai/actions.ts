'use server';

import { revalidatePath } from 'next/cache';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import {
  ajouterRdv,
  changerAppareilEssai,
  confirmerAchat,
  enregistrerProlongation,
} from '@/server/services/essais';

/** L'écran reste sur le dossier : la confirmation s'affiche dans le formulaire (voir ADR-011). */
function terminer(dossierId: string, succes: string): EtatFormulaire {
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath('/essais');
  return { succes };
}

export async function ajouterRdvAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    date: texte(formData, 'date'),
    type: texte(formData, 'type'),
    compteRendu: texte(formData, 'compteRendu'),
  };
  const erreur = await executer(() => ajouterRdv(acteur, dossierId, donnees), donnees);
  return erreur ?? terminer(dossierId, 'Rendez-vous enregistré.');
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
