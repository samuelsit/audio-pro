import { centimes, type Centimes } from '../money';
import type { StatutAppareil } from './etats';

/** Le client en reste propriétaire : ces appareils comptent, même hors de l'étagère. */
const STATUTS_VALORISES: readonly StatutAppareil[] = [
  'EN_STOCK',
  'RESERVE',
  'EN_ESSAI',
  'PRET',
  'SAV',
];

/** Un appareil en consignation appartient au fabricant ; un appareil vendu ou retourné est sorti. */
export function appareilValorise(statut: StatutAppareil, enConsignation: boolean): boolean {
  return !enConsignation && STATUTS_VALORISES.includes(statut);
}

export interface ArticleValorise {
  readonly quantite: number;
  /** `null` : prix d'achat non renseigné. */
  readonly prixAchatCentimes: number | null;
}

export interface ValeurStock {
  readonly valeurCentimes: Centimes;
  /** Articles exclus de la valeur faute de prix : un manque, jamais un zéro silencieux. */
  readonly articlesSansPrix: number;
}

/** Valeur au prix d'achat. Choix de gestion, sans texte de référence (ADR-023). */
export function valeurStock(articles: readonly ArticleValorise[]): ValeurStock {
  let valeur = 0;
  let articlesSansPrix = 0;
  for (const { quantite, prixAchatCentimes } of articles) {
    if (prixAchatCentimes === null) {
      articlesSansPrix += quantite;
    } else {
      valeur += prixAchatCentimes * quantite;
    }
  }
  return { valeurCentimes: centimes(valeur), articlesSansPrix };
}
