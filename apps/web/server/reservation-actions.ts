import { headers } from 'next/headers';

import type { EtatFormulaire } from '@/lib/formulaire';

import { AccesRefuseError } from './auth/acces';
import { adresseClient } from './auth/limitation';
import { ErreurSaisie } from './erreurs';
import { ErreurCreneauIndisponible, ErreurParcoursExpire } from './services/reservation-en-ligne';

/** Réponse d'une action du parcours public. `notifier()` passe par un cookie, perdu dans une iframe tierce. */
export type ReponsePublique<T> =
  | { readonly ok: true; readonly valeur: T }
  | {
      readonly ok: false;
      readonly etat: EtatFormulaire;
      /** Le créneau ou le parcours est perdu : le patient revient au choix du créneau. */
      readonly retourAuChoix: boolean;
    };

export async function adresseVisiteur(): Promise<string> {
  return adresseClient((await headers()).get('x-forwarded-for'));
}

/** Convertit les refus attendus. Le reste remonte : une panne ne se déguise pas en saisie invalide. */
export async function repondre<T>(operation: () => Promise<T>): Promise<ReponsePublique<T>> {
  try {
    return { ok: true, valeur: await operation() };
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError) {
      return {
        ok: false,
        etat: { message: 'Cette page n’est plus disponible.' },
        retourAuChoix: true,
      };
    }
    if (erreur instanceof ErreurSaisie) {
      return {
        ok: false,
        etat: { message: erreur.message, erreurs: erreur.erreurs },
        retourAuChoix:
          erreur instanceof ErreurCreneauIndisponible || erreur instanceof ErreurParcoursExpire,
      };
    }
    throw erreur;
  }
}
