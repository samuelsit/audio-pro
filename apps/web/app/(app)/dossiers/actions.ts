'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  abandonnerDossier,
  creerDossier,
  enregistrerPrescription,
} from '@/server/services/dossiers';

function accesDossier(id: string): string {
  return `/dossiers/${id}`;
}

export async function creerDossierAction(
  patientId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    centreId: texte(formData, 'centreId'),
    praticienId: texte(formData, 'praticienId'),
    oreilles: texte(formData, 'oreilles'),
    typeDroite: texte(formData, 'typeDroite'),
    typeGauche: texte(formData, 'typeGauche'),
    surdicecite: coche(formData, 'surdicecite'),
  };
  let id = '';
  const erreur = await executer(async () => {
    id = await creerDossier(acteur, patientId, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(`/patients/${patientId}/dossiers`);
  await notifier('Dossier créé.');
  redirect(accesDossier(id));
}

async function octetsDuScan(formData: FormData): Promise<Uint8Array> {
  const fichier = formData.get('scan');
  return fichier instanceof File ? new Uint8Array(await fichier.arrayBuffer()) : new Uint8Array(0);
}

export async function enregistrerPrescriptionAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    prescripteurId: texte(formData, 'prescripteurId'),
    datePrescription: texte(formData, 'datePrescription'),
    oreilles: texte(formData, 'oreilles'),
    mentionRenouvellement: coche(formData, 'mentionRenouvellement'),
    statutAttendu: texte(formData, 'statutAttendu'),
    forcer: coche(formData, 'forcer'),
    motifForcage: texte(formData, 'motifForcage'),
  };
  const scan = await octetsDuScan(formData);
  const erreur = await executer(
    () => enregistrerPrescription(acteur, dossierId, donnees, scan),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  revalidatePath(accesDossier(dossierId));
  await notifier('Prescription enregistrée.');
  redirect(accesDossier(dossierId));
}

export async function abandonnerDossierAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    statutAttendu: texte(formData, 'statutAttendu'),
    motif: texte(formData, 'motif'),
  };
  let patientId = '';
  const erreur = await executer(async () => {
    patientId = await abandonnerDossier(acteur, dossierId, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(accesDossier(dossierId));
  await notifier('Dossier abandonné.');
  // La notification s'affiche à un changement de chemin : on revient sur la liste du patient.
  redirect(`/patients/${patientId}/dossiers`);
}
