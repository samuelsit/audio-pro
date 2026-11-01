'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { creerComplementaire, modifierComplementaire } from '@/server/services/complementaires';
import {
  annulerReglement,
  classerEcartReglement,
  delettrer,
  enregistrerEcart,
  enregistrerRejet,
  enregistrerReglement,
  lettrer,
  marquerRelancee,
  resoudreRejet,
  transfererAuPatient,
} from '@/server/services/tiers-payant';

function terminer(succes: string): EtatFormulaire {
  revalidatePath('/tiers-payant', 'layout');
  return { succes };
}

export async function enregistrerReglementAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    complementaireId: texte(formData, 'complementaireId'),
    organisme: texte(formData, 'organisme'),
    dateReglement: texte(formData, 'dateReglement'),
    reference: texte(formData, 'reference'),
    partAmo: texte(formData, 'partAmo'),
    partAmc: texte(formData, 'partAmc'),
  };
  let id = '';
  const erreur = await executer(async () => {
    id = await enregistrerReglement(acteur, centreId, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/tiers-payant', 'layout');
  redirect(`/tiers-payant/reglements/${id}`);
}

export async function lettrerAction(
  reglementId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const montants = liste(formData, 'montant');
  const imputations = liste(formData, 'creanceId')
    .map((creanceId, rang) => ({ creanceId, montant: (montants[rang] ?? '').trim() }))
    .filter(({ montant }) => montant !== '');
  const erreur = await executer(() => lettrer(acteur, reglementId, { imputations }));
  return erreur ?? terminer('Lettrage enregistré.');
}

export async function delettrerAction(lettrageId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => delettrer(acteur, lettrageId));
  return erreur ?? terminer('Lettrage défait.');
}

export async function annulerReglementAction(
  reglementId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(() => annulerReglement(acteur, reglementId, donnees), donnees);
  return erreur ?? terminer('Règlement annulé.');
}

export async function classerEcartAction(
  reglementId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    montant: texte(formData, 'montant'),
    motif: texte(formData, 'motif'),
    type: texte(formData, 'type'),
  };
  const erreur = await executer(() => classerEcartReglement(acteur, reglementId, donnees), donnees);
  return erreur ?? terminer('Écart classé.');
}

function saisieEcart(formData: FormData) {
  return { montant: texte(formData, 'montant'), motif: texte(formData, 'motif') };
}

export async function enregistrerEcartAction(
  creanceId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisieEcart(formData);
  const erreur = await executer(() => enregistrerEcart(acteur, creanceId, donnees), donnees);
  return erreur ?? terminer('Écart enregistré.');
}

export async function transfererAction(
  creanceId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisieEcart(formData);
  const erreur = await executer(() => transfererAuPatient(acteur, creanceId, donnees), donnees);
  return erreur ?? terminer('Créance transférée au patient.');
}

export async function enregistrerRejetAction(
  creanceId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    dateRejet: texte(formData, 'dateRejet'),
    code: texte(formData, 'code'),
    motif: texte(formData, 'motif'),
  };
  const erreur = await executer(() => enregistrerRejet(acteur, creanceId, donnees), donnees);
  return erreur ?? terminer('Rejet enregistré.');
}

export async function resoudreRejetAction(
  rejetId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { resolution: texte(formData, 'resolution'), motif: texte(formData, 'motif') };
  const erreur = await executer(() => resoudreRejet(acteur, rejetId, donnees), donnees);
  return erreur ?? terminer('Rejet traité.');
}

export async function marquerRelanceeAction(creanceId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => marquerRelancee(acteur, creanceId));
  return erreur ?? terminer('Relance notée.');
}

function saisieComplementaire(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    identifiant: texte(formData, 'identifiant'),
    plateformeTiersPayant: texte(formData, 'plateformeTiersPayant'),
    telephone: texte(formData, 'telephone'),
    email: texte(formData, 'email'),
    adresse: texte(formData, 'adresse'),
    modePec: texte(formData, 'modePec'),
    delaiPaiementJours: texte(formData, 'delaiPaiementJours'),
    actif: coche(formData, 'actif'),
  };
}

export async function enregistrerComplementaireAction(
  complementaireId: string | null,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisieComplementaire(formData);
  const erreur = await executer(
    () =>
      complementaireId
        ? modifierComplementaire(acteur, complementaireId, donnees)
        : creerComplementaire(acteur, donnees),
    donnees,
  );
  return erreur ?? terminer('Complémentaire enregistrée.');
}
