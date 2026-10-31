'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  creerBilan,
  enregistrerFormulaire,
  enregistrerOtoscopie,
  enregistrerTonale,
  enregistrerVocale,
} from '@/server/services/audiologie';

function jsonSaisi(formData: FormData, nom: string): unknown {
  try {
    return JSON.parse(texte(formData, nom));
  } catch {
    return null;
  }
}

async function terminer(
  etat: EtatFormulaire | null,
  patientId: string,
  bilanId: string,
  message: string,
): Promise<EtatFormulaire> {
  if (etat) {
    return etat;
  }
  revalidatePath(`/patients/${patientId}/audiologie`, 'layout');
  await notifier(message);
  redirect(`/patients/${patientId}/audiologie/${bilanId}`);
}

export async function creerBilanAction(
  patientId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { dateBilan: texte(formData, 'dateBilan') };
  let bilanId = '';
  const etat = await executer(async () => {
    bilanId = await creerBilan(acteur, patientId, donnees);
  }, donnees);
  return terminer(etat, patientId, bilanId, 'Bilan créé.');
}

export async function enregistrerTonaleAction(
  patientId: string,
  bilanId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const saisie = {
    appareil: texte(formData, 'appareil'),
    audiogramme: jsonSaisi(formData, 'audiogramme'),
  };
  const etat = await executer(() => enregistrerTonale(acteur, bilanId, saisie));
  return terminer(etat, patientId, bilanId, 'Audiogramme enregistré.');
}

export async function enregistrerVocaleAction(
  patientId: string,
  bilanId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const saisie = {
    appareil: texte(formData, 'appareil'),
    vocale: jsonSaisi(formData, 'vocale'),
  };
  const etat = await executer(() => enregistrerVocale(acteur, bilanId, saisie));
  return terminer(etat, patientId, bilanId, 'Audiométrie vocale enregistrée.');
}

export async function enregistrerOtoscopieAction(
  patientId: string,
  bilanId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    oreille: texte(formData, 'oreille'),
    conduit: texte(formData, 'conduit'),
    tympan: texte(formData, 'tympan'),
    observation: texte(formData, 'observation'),
  };
  const fichier = formData.get('photo');
  const photo =
    fichier instanceof File && fichier.size > 0
      ? new Uint8Array(await fichier.arrayBuffer())
      : null;
  const etat = await executer(() => enregistrerOtoscopie(acteur, bilanId, donnees, photo), donnees);
  return terminer(etat, patientId, bilanId, 'Otoscopie enregistrée.');
}

export async function enregistrerFormulaireAction(
  patientId: string,
  bilanId: string,
  modeleId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  // Les champs portent l'identifiant des questions ; ceux de Next commencent par « $ ».
  const donnees = Object.fromEntries(
    [...formData.entries()].flatMap(([champ, valeur]) =>
      typeof valeur === 'string' && !champ.startsWith('$') ? [[champ, valeur]] : [],
    ),
  ) as Record<string, string>;
  const etat = await executer(
    () => enregistrerFormulaire(acteur, bilanId, modeleId, donnees),
    donnees,
  );
  return terminer(etat, patientId, bilanId, 'Formulaire enregistré.');
}
