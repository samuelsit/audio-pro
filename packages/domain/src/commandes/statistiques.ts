import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { parametreOptionnel } from '../commun/texte';

const MS_PAR_JOUR = 86_400_000;

export const filtreStatistiquesSchema = z
  .object({
    du: dateCalendaireSchema,
    au: dateCalendaireSchema,
    fournisseurId: parametreOptionnel(z.uuid()).catch(undefined),
  })
  .refine(({ du, au }) => du <= au, { path: ['au'], message: 'La fin précède le début.' });
export type FiltreStatistiques = z.output<typeof filtreStatistiquesSchema>;

export interface FactureAgregee {
  readonly fournisseur: string;
  readonly centre: string;
  readonly montantHtCentimes: number;
}

export interface LigneAchats {
  readonly fournisseur: string;
  readonly centre: string;
  readonly factures: number;
  readonly montantHtCentimes: number;
}

/** Achats par fournisseur et par centre, du plus gros au plus petit. */
export function agregerAchats(factures: readonly FactureAgregee[]): LigneAchats[] {
  const lignes = new Map<string, LigneAchats>();
  for (const { fournisseur, centre, montantHtCentimes } of factures) {
    const cle = `${fournisseur}\u0000${centre}`;
    const ligne = lignes.get(cle);
    lignes.set(cle, {
      fournisseur,
      centre,
      factures: (ligne?.factures ?? 0) + 1,
      montantHtCentimes: (ligne?.montantHtCentimes ?? 0) + montantHtCentimes,
    });
  }
  return [...lignes.values()].sort(
    (a, b) =>
      b.montantHtCentimes - a.montantHtCentimes ||
      a.fournisseur.localeCompare(b.fournisseur, 'fr') ||
      a.centre.localeCompare(b.centre, 'fr'),
  );
}

export interface LivraisonDatee {
  readonly fournisseur: string;
  /** ISO 8601. */
  readonly envoyeeLe: string;
  /** Date de la première réception, ISO 8601. */
  readonly recueLe: string;
}

export interface LigneDelais {
  readonly fournisseur: string;
  readonly commandes: number;
  readonly delaiMoyenJours: number;
  readonly delaiMaxJours: number;
}

function joursEntre(debut: string, fin: string): number {
  const jours = (Date.parse(fin.slice(0, 10)) - Date.parse(debut.slice(0, 10))) / MS_PAR_JOUR;
  return Math.max(0, jours);
}

/** Délai entre l'envoi et la première livraison, par fournisseur. Moyenne au dixième de jour. */
export function agregerDelais(livraisons: readonly LivraisonDatee[]): LigneDelais[] {
  const parFournisseur = new Map<string, number[]>();
  for (const { fournisseur, envoyeeLe, recueLe } of livraisons) {
    parFournisseur.set(fournisseur, [
      ...(parFournisseur.get(fournisseur) ?? []),
      joursEntre(envoyeeLe, recueLe),
    ]);
  }
  return [...parFournisseur.entries()]
    .map(([fournisseur, delais]) => ({
      fournisseur,
      commandes: delais.length,
      delaiMoyenJours: Math.round((delais.reduce((t, d) => t + d, 0) / delais.length) * 10) / 10,
      delaiMaxJours: Math.max(...delais),
    }))
    .sort((a, b) => a.fournisseur.localeCompare(b.fournisseur, 'fr'));
}
