'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { emettreAvoir } from '@/server/services/avoirs';
import {
  abandonnerBrouillon,
  ajouterLigneBrouillon,
  confirmerCouvertureVente,
  creerVenteDirecte,
  retirerLigneBrouillon,
  validerFacture,
} from '@/server/services/facturation';
import { actualiserStatutFse, preparerFse } from '@/server/services/fse';
import { envoyerFactureAuPatient } from '@/server/services/liens-document';

function terminer(factureId: string, succes: string): EtatFormulaire {
  revalidatePath(`/factures/${factureId}`);
  revalidatePath('/factures');
  return { succes };
}

export async function creerVenteDirecteAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    patientId: texte(formData, 'patientId'),
    centreId: texte(formData, 'centreId'),
    prescriptionId: texte(formData, 'prescriptionId'),
  };
  let factureId = '';
  const erreur = await executer(async () => {
    factureId = await creerVenteDirecte(acteur, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  redirect(`/factures/${factureId}`);
}

export async function ajouterLigneAction(
  factureId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    nature: texte(formData, 'nature'),
    accessoireId: texte(formData, 'accessoireId'),
    libelle: texte(formData, 'libelle'),
    quantite: texte(formData, 'quantite'),
    prixUnitaire: texte(formData, 'prixUnitaire'),
  };
  const erreur = await executer(() => ajouterLigneBrouillon(acteur, factureId, donnees), donnees);
  return erreur ?? terminer(factureId, 'Ligne ajoutée.');
}

export async function retirerLigneAction(factureId: string, ligneId: string): Promise<void> {
  const acteur = await requireSession();
  await retirerLigneBrouillon(acteur, factureId, ligneId);
  revalidatePath(`/factures/${factureId}`);
}

export async function validerAction(factureId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => validerFacture(acteur, factureId));
  return erreur ?? terminer(factureId, 'Facture validée.');
}

export async function confirmerCouvertureAction(factureId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => confirmerCouvertureVente(acteur, factureId));
  return erreur ?? terminer(factureId, 'Couverture AMO confirmée.');
}

export async function abandonnerAction(factureId: string): Promise<void> {
  const acteur = await requireSession();
  await abandonnerBrouillon(acteur, factureId);
  await notifier('Vente abandonnée.');
  redirect('/factures');
}

export async function emettreAvoirAction(
  factureId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const lignes = formData.getAll('ligneId').map(String);
  const montants = formData.getAll('montant').map(String);
  const donnees = { mode: texte(formData, 'mode'), motif: texte(formData, 'motif') };
  const reprises = lignes.map((ligneId, index) => ({ ligneId, montant: montants[index] ?? '' }));
  let avoirId = '';
  let alerteFse = false;
  const erreur = await executer(async () => {
    ({ avoirId, alerteFse } = await emettreAvoir(acteur, factureId, { ...donnees, reprises }));
  }, donnees);
  if (erreur) {
    return erreur;
  }
  await notifier(
    alerteFse
      ? 'Avoir émis. La FSE de cette facture est déjà partie : elle reste à corriger.'
      : 'Avoir émis.',
  );
  redirect(`/factures/${avoirId}`);
}

export async function envoyerFactureAction(
  factureId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { canal: texte(formData, 'canal') };
  const erreur = await executer(() => envoyerFactureAuPatient(acteur, factureId, donnees), donnees);
  return erreur ?? terminer(factureId, 'Lien sécurisé envoyé au patient.');
}

export async function preparerFseAction(factureId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => preparerFse(acteur, factureId));
  return erreur ?? terminer(factureId, 'FSE préparée.');
}

export async function actualiserFseAction(factureId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => actualiserStatutFse(acteur, factureId));
  return erreur ?? terminer(factureId, 'Statut actualisé.');
}
