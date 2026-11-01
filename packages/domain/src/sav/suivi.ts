import { z } from 'zod';

import { ajouterJours, ajouterMois, dateCalendaireSchema } from '../commun/date';
import { texteObligatoire } from '../commun/texte';
import type { ParametresSav } from './parametres';

/** Visibles 30 jours avant l'échéance. Choix applicatif, comme l'alerte de l'essai (R57). */
export const AVANCE_CONTROLE_JOURS = 30;
/** Un contrôle manqué depuis plus d'un an ne se propose plus : le suivi annuel a pris le relais. */
export const RETARD_CONTROLE_MOIS = 12;

export interface DelivranceSuivie {
  readonly dateDelivrance: string;
  readonly oreille: string;
}

export interface ControleTraite {
  readonly dateReference: string;
  readonly rang: number;
}

export interface ControleAPlanifier {
  readonly dateReference: string;
  readonly rang: number;
  readonly datePrevue: string;
  readonly enRetard: boolean;
  /** Mois depuis la délivrance. */
  readonly mois: number;
}

/**
 * Mois des contrôles d'un appareillage jusqu'à `horizonMois` : le rythme de la première période, puis `suiviParAn`.
 * Source : modele-devis-audio.pdf p. 2 § 4 (3e, 6e et 12e mois, puis au moins deux rendez-vous par an) ;
 * convention-audioprothesistes.pdf, art. 19, p. 20-21 (deux consultations annuelles recommandées, sans grief).
 */
export function moisDesControles(parametres: ParametresSav, horizonMois: number): number[] {
  const { suiviMois, suiviParAn } = parametres;
  const mois = suiviMois.filter((m) => m <= horizonMois);
  if (suiviParAn === 0) {
    return mois;
  }
  const dernier = suiviMois.at(-1) ?? 0;
  const intervalle = 12 / suiviParAn;
  for (let rang = 1; dernier + rang * intervalle <= horizonMois; rang += 1) {
    mois.push(Math.round(dernier + rang * intervalle));
  }
  return mois;
}

function moisEntre(debut: string, fin: string): number {
  const annees = Number(fin.slice(0, 4)) - Number(debut.slice(0, 4));
  return annees * 12 + Number(fin.slice(5, 7)) - Number(debut.slice(5, 7)) + 1;
}

/**
 * Contrôles à planifier pour un patient. Une même date de délivrance fait un seul suivi, qu'il soit simple ou
 * bilatéral (art. 20, p. 21). Un appareillage plus récent de toutes ses oreilles clôt l'ancien.
 */
export function controlesAPlanifier(
  delivrances: readonly DelivranceSuivie[],
  parametres: ParametresSav,
  traites: readonly ControleTraite[],
  jour: string,
): ControleAPlanifier[] {
  const horizon = ajouterJours(jour, AVANCE_CONTROLE_JOURS);
  const plusAncien = ajouterMois(jour, -RETARD_CONTROLE_MOIS);
  const dates = [...new Set(delivrances.map((d) => d.dateDelivrance))];
  const actuelles = dates.filter((date) => {
    const oreilles = delivrances.filter((d) => d.dateDelivrance === date).map((d) => d.oreille);
    return !oreilles.every((oreille) =>
      delivrances.some((d) => d.oreille === oreille && d.dateDelivrance > date),
    );
  });
  return actuelles
    .flatMap((dateReference) =>
      moisDesControles(parametres, moisEntre(dateReference, horizon)).map((mois, index) => ({
        dateReference,
        rang: index + 1,
        mois,
        datePrevue: ajouterMois(dateReference, mois),
      })),
    )
    .filter(
      ({ dateReference, rang, datePrevue }) =>
        datePrevue <= horizon &&
        datePrevue >= plusAncien &&
        !traites.some((t) => t.dateReference === dateReference && t.rang === rang),
    )
    .map((controle) => ({ ...controle, enRetard: controle.datePrevue < jour }))
    .sort((a, b) => a.datePrevue.localeCompare(b.datePrevue));
}

export const STATUTS_RDV_PROPOSABLES = ['ABSENT', 'ANNULE'] as const;

export interface DecisionControle {
  readonly dateReference: string;
  readonly rang: number;
  readonly statut: 'PLANIFIE' | 'IGNORE';
  readonly rendezVous: { readonly statut: string } | null;
}

/** Un rendez-vous annulé ou manqué repropose son contrôle ; tout autre statut le traite. */
export function controlesTraites(lignes: readonly DecisionControle[]): ControleTraite[] {
  return lignes
    .filter(
      ({ statut, rendezVous }) =>
        statut === 'IGNORE' ||
        !STATUTS_RDV_PROPOSABLES.some((proposable) => proposable === rendezVous?.statut),
    )
    .map(({ dateReference, rang }) => ({ dateReference, rang }));
}

const controleRefSchema = z.object({
  patientId: z.uuid('Patient inconnu.'),
  dateReference: dateCalendaireSchema,
  rang: z.coerce.number({ error: 'Contrôle inconnu.' }).int().min(1, 'Contrôle inconnu.'),
});

export const planificationControleSchema = controleRefSchema.extend({
  centreId: z.uuid('Choisir un centre.'),
  typeRdvId: z.uuid('Choisir le type de rendez-vous.'),
  /** Créneau choisi : `date|heure|praticien|cabine`. */
  creneau: z
    .string({ error: 'Choisir un créneau.' })
    .regex(/^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}\|[^|]*\|[^|]*$/, 'Choisir un créneau.'),
});

export const ignoranceControleSchema = controleRefSchema.extend({
  motif: texteObligatoire('Le motif est obligatoire.', 500),
});

export function clefCreneau(creneau: {
  readonly date: string;
  readonly heure: string;
  readonly praticienId: string | null;
  readonly cabineId: string | null;
}): string {
  return [creneau.date, creneau.heure, creneau.praticienId ?? '', creneau.cabineId ?? ''].join('|');
}

export function lireCreneau(clef: string) {
  const [date = '', heure = '', praticienId = '', cabineId = ''] = clef.split('|');
  return { date, heure, praticienId, cabineId };
}
