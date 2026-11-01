'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { venteComptoir } from '@/server/services/comptoir';
import { ignorerControle, planifierControle } from '@/server/services/suivi';
import { preterAppareil, rendrePret } from '@/server/services/prets';
import {
  abandonnerRemplacant,
  annulerRetour,
  corrigerSerieRemplacant,
  echangerAppareilDuStock,
  enregistrerIssue,
  enregistrerRemplacant,
  envoyerRetour,
  preparerRetour,
  remettreRemplacant,
} from '@/server/services/retours-fabricant';
import {
  annulerTicket,
  diagnostiquerTicket,
  facturerTicket,
  ouvrirTicket,
  restituerAppareil,
  terminerReparation,
} from '@/server/services/tickets-sav';

function terminerTicket(ticketId: string): EtatFormulaire {
  revalidatePath(`/sav/tickets/${ticketId}`);
  revalidatePath('/sav');
  return {};
}

function terminerRetour(retourId: string): EtatFormulaire {
  revalidatePath(`/sav/retours/${retourId}`);
  revalidatePath('/sav/retours');
  revalidatePath('/sav');
  return {};
}

function donneesRemplacant(formData: FormData) {
  return {
    modeleId: texte(formData, 'modeleId'),
    numeroSerie: texte(formData, 'numeroSerie'),
    confirmation: texte(formData, 'confirmation'),
    referenceBonLivraison: texte(formData, 'referenceBonLivraison'),
  };
}

export async function ouvrirTicketAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    numeroSerie: texte(formData, 'numeroSerie'),
    motif: texte(formData, 'motif'),
    description: texte(formData, 'description'),
  };
  let id = '';
  const erreur = await executer(async () => {
    id = await ouvrirTicket(acteur, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/sav');
  redirect(`/sav/tickets/${id}`);
}

export async function diagnostiquerAction(
  ticketId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    motif: texte(formData, 'motif'),
    diagnostic: texte(formData, 'diagnostic'),
    action: texte(formData, 'action'),
    cout: texte(formData, 'cout'),
  };
  const erreur = await executer(() => diagnostiquerTicket(acteur, ticketId, donnees), donnees);
  return erreur ?? terminerTicket(ticketId);
}

export async function annulerAction(
  ticketId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(() => annulerTicket(acteur, ticketId, donnees), donnees);
  return erreur ?? terminerTicket(ticketId);
}

export async function terminerReparationAction(ticketId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => terminerReparation(acteur, ticketId), {});
  return erreur ?? terminerTicket(ticketId);
}

export async function restituerAction(ticketId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => restituerAppareil(acteur, ticketId), {});
  return erreur ?? terminerTicket(ticketId);
}

export async function facturerAction(
  ticketId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  let factureId = '';
  const erreur = await executer(async () => {
    factureId = await facturerTicket(acteur, ticketId, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(`/sav/tickets/${ticketId}`);
  redirect(`/factures/${factureId}`);
}

export async function preparerRetourAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    fournisseurId: texte(formData, 'fournisseurId'),
    ticketId: texte(formData, 'ticketId'),
    appareilId: texte(formData, 'appareilId'),
    ecartId: texte(formData, 'ecartId'),
    descriptionPanne: texte(formData, 'descriptionPanne'),
  };
  let id = '';
  const erreur = await executer(async () => {
    id = await preparerRetour(acteur, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/sav/retours');
  redirect(`/sav/retours/${id}`);
}

export async function envoyerRetourAction(
  retourId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    transporteur: texte(formData, 'transporteur'),
    numeroSuivi: texte(formData, 'numeroSuivi'),
    dateEnvoi: texte(formData, 'dateEnvoi'),
  };
  const erreur = await executer(() => envoyerRetour(acteur, retourId, donnees), donnees);
  return erreur ?? terminerRetour(retourId);
}

export async function enregistrerIssueAction(
  retourId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { issue: texte(formData, 'issue') };
  const erreur = await executer(() => enregistrerIssue(acteur, retourId, donnees), donnees);
  return erreur ?? terminerRetour(retourId);
}

export async function annulerRetourAction(retourId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => annulerRetour(acteur, retourId), {});
  return erreur ?? terminerRetour(retourId);
}

export async function enregistrerRemplacantAction(
  ticketId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = donneesRemplacant(formData);
  const erreur = await executer(() => enregistrerRemplacant(acteur, ticketId, donnees), donnees);
  return erreur ?? terminerTicket(ticketId);
}

export async function echangerStockAction(
  retourId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = donneesRemplacant(formData);
  const erreur = await executer(() => echangerAppareilDuStock(acteur, retourId, donnees), donnees);
  return erreur ?? terminerRetour(retourId);
}

export async function corrigerSerieAction(
  ticketId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    numeroSerie: texte(formData, 'numeroSerie'),
    confirmation: texte(formData, 'confirmation'),
  };
  const erreur = await executer(() => corrigerSerieRemplacant(acteur, ticketId, donnees), donnees);
  return erreur ?? terminerTicket(ticketId);
}

export async function abandonnerRemplacantAction(
  ticketId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(() => abandonnerRemplacant(acteur, ticketId, donnees), donnees);
  return erreur ?? terminerTicket(ticketId);
}

export async function remettreRemplacantAction(ticketId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => remettreRemplacant(acteur, ticketId), {});
  return erreur ?? terminerTicket(ticketId);
}

export async function preterAction(_: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    appareilId: texte(formData, 'appareilId'),
    patientId: texte(formData, 'patientId'),
    dateRetourPrevue: texte(formData, 'dateRetourPrevue'),
    ticketId: '',
  };
  const erreur = await executer(() => preterAppareil(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/sav/prets');
  redirect('/sav/prets');
}

export async function rendrePretAction(
  pretId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { etatRetour: texte(formData, 'etatRetour') };
  const erreur = await executer(() => rendrePret(acteur, pretId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/sav/prets');
  return {};
}

export async function venteComptoirAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const lignes = [...formData.entries()].flatMap(([cle, valeur]) => {
    const quantite = String(valeur).trim();
    return cle.startsWith('quantite:') && quantite !== '' && quantite !== '0'
      ? [{ accessoireId: cle.slice('quantite:'.length), quantite }]
      : [];
  });
  const donnees = {
    patientId: texte(formData, 'patientId'),
    centreId: texte(formData, 'centreId'),
    prescriptionId: texte(formData, 'prescriptionId'),
    entretienLibelle: texte(formData, 'entretienLibelle'),
    entretienPrix: texte(formData, 'entretienPrix'),
  };
  let factureId = '';
  const erreur = await executer(async () => {
    factureId = await venteComptoir(acteur, { ...donnees, lignes });
  }, donnees);
  if (erreur) {
    return erreur;
  }
  redirect(`/factures/${factureId}`);
}

function donneesControle(formData: FormData) {
  return {
    patientId: texte(formData, 'patientId'),
    dateReference: texte(formData, 'dateReference'),
    rang: texte(formData, 'rang'),
  };
}

export async function planifierControleAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    ...donneesControle(formData),
    centreId: texte(formData, 'centreId'),
    typeRdvId: texte(formData, 'typeRdvId'),
    creneau: texte(formData, 'creneau'),
  };
  const erreur = await executer(() => planifierControle(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/sav/suivi');
  redirect('/sav/suivi');
}

export async function ignorerControleAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { ...donneesControle(formData), motif: texte(formData, 'motif') };
  const erreur = await executer(() => ignorerControle(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/sav/suivi');
  redirect('/sav/suivi');
}
