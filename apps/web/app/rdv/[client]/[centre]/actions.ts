'use server';

import type { ReponsePublique } from '@/server/reservation-actions';
import { adresseVisiteur, repondre } from '@/server/reservation-actions';
import {
  creerDefiCaptcha,
  demanderCode,
  libererVerrou,
  lireCreneaux,
  resoudreCentre,
  validerCode,
  verrouillerCreneau,
  type CodeEnvoye,
  type ConfirmationReservation,
  type LectureCreneaux,
  type VerrouPose,
} from '@/server/services/reservation-en-ligne';

export interface AdresseCentre {
  readonly client: string;
  readonly centre: string;
}

export async function chargerCreneauxAction(
  { client, centre }: AdresseCentre,
  saisie: unknown,
): Promise<ReponsePublique<LectureCreneaux>> {
  return repondre(async () =>
    lireCreneaux(await resoudreCentre(client, centre), saisie, await adresseVisiteur()),
  );
}

export async function defiCaptchaAction(): Promise<ReponsePublique<string>> {
  return repondre(() => creerDefiCaptcha());
}

export async function verrouillerAction(
  { client, centre }: AdresseCentre,
  saisie: unknown,
): Promise<ReponsePublique<VerrouPose>> {
  return repondre(async () =>
    verrouillerCreneau(await resoudreCentre(client, centre), saisie, await adresseVisiteur()),
  );
}

export async function libererAction({ client, centre }: AdresseCentre, jeton: string) {
  return repondre(async () => libererVerrou(await resoudreCentre(client, centre), jeton));
}

export async function demanderCodeAction(
  { client, centre }: AdresseCentre,
  jeton: string,
  saisie: unknown,
): Promise<ReponsePublique<CodeEnvoye>> {
  return repondre(async () =>
    demanderCode(await resoudreCentre(client, centre), jeton, saisie, await adresseVisiteur()),
  );
}

export async function validerCodeAction(
  { client, centre }: AdresseCentre,
  jeton: string,
  code: unknown,
): Promise<ReponsePublique<ConfirmationReservation>> {
  return repondre(async () =>
    validerCode(await resoudreCentre(client, centre), jeton, code, await adresseVisiteur()),
  );
}
