import { z } from 'zod';

import { JOURS_SEMAINE, type JourSemaine } from '../centre/horaires';
import { ajouterJours } from '../commun/date';
import {
  instantDePlage,
  jourSemaine,
  localDepuisInstant,
  minutesDepuisMinuit,
} from '../commun/fuseau';
import { estFerie } from './feries';

export interface PlageEnvoi {
  readonly heureDebut: string;
  readonly heureFin: string;
  readonly jours: readonly JourSemaine[];
  readonly feries: boolean;
}

/**
 * À VÉRIFIER : aucun texte de docs/ref sur les horaires d'envoi (ADR-033). Valeur prudente, modifiable par client.
 */
export const PLAGE_ENVOI_DEFAUT: PlageEnvoi = {
  heureDebut: '09:00',
  heureFin: '19:00',
  jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  feries: false,
};

const heureSchema = z
  .string({ error: 'Heure invalide.' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide.');

export const plageEnvoiSchema = z
  .object({
    heureDebut: heureSchema,
    heureFin: heureSchema,
    jours: z.array(z.enum(JOURS_SEMAINE)).min(1, 'Choisir au moins un jour.'),
    feries: z.boolean(),
  })
  .refine((p) => p.heureDebut < p.heureFin, {
    error: 'L’heure de fin doit suivre l’heure de début.',
    path: ['heureFin'],
  });

/** Ce jour admet des envois. */
export function jourOuvertEnvoi(plage: PlageEnvoi, date: string): boolean {
  return plage.jours.includes(jourSemaine(date)) && (plage.feries || !estFerie(date));
}

/** Fin exclue : à 19 h pile, la plage de 9 h à 19 h est fermée. */
export function estDansPlage(plage: PlageEnvoi, instantMs: number): boolean {
  const { date, heure } = localDepuisInstant(instantMs);
  const minutes = minutesDepuisMinuit(heure);
  return (
    jourOuvertEnvoi(plage, date) &&
    minutes >= minutesDepuisMinuit(plage.heureDebut) &&
    minutes < minutesDepuisMinuit(plage.heureFin)
  );
}

const JOURS_RECHERCHES = 366;

/**
 * Premier instant d'envoi permis, à partir de `instantMs` inclus. `null` si aucun jour ne s'ouvre sur un an :
 * cela n'arrive qu'avec une plage limitée à des jours fériés.
 */
export function prochainCreneau(plage: PlageEnvoi, instantMs: number): number | null {
  if (estDansPlage(plage, instantMs)) {
    return instantMs;
  }
  const { date } = localDepuisInstant(instantMs);
  for (let ecart = 0; ecart < JOURS_RECHERCHES; ecart += 1) {
    const jour = ajouterJours(date, ecart);
    const ouverture = instantDePlage(jour, plage.heureDebut, 'DEBUT');
    if (jourOuvertEnvoi(plage, jour) && ouverture > instantMs) {
      return ouverture;
    }
  }
  return null;
}
