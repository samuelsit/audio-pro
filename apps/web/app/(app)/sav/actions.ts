'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
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
