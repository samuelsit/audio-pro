'use server';

import { revalidatePath } from 'next/cache';

import { adresseVisiteur, repondre, type ReponsePublique } from '@/server/reservation-actions';
import {
  annulerParLien,
  deplacerParLien,
  lireCreneauxDuLien,
  type ConfirmationReservation,
  type LectureCreneaux,
} from '@/server/services/reservation-en-ligne';

export async function annulerAction(jeton: string): Promise<ReponsePublique<void>> {
  const reponse = await repondre(async () => annulerParLien(jeton, await adresseVisiteur()));
  revalidatePath(`/rdv/lien/${jeton}`);
  return reponse;
}

export async function creneauxDuLienAction(
  jeton: string,
  depuis: string,
): Promise<ReponsePublique<LectureCreneaux>> {
  return repondre(async () => lireCreneauxDuLien(jeton, depuis, await adresseVisiteur()));
}

export async function deplacerAction(
  jeton: string,
  debut: number,
): Promise<ReponsePublique<ConfirmationReservation>> {
  const reponse = await repondre(async () =>
    deplacerParLien(jeton, { debut }, await adresseVisiteur()),
  );
  revalidatePath(`/rdv/lien/${jeton}`);
  return reponse;
}
