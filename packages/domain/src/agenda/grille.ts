import { instantSaisi, localDepuisInstant, minutesDepuisMinuit } from '../commun/fuseau';
import type { Intervalle } from './intervalles';

/**
 * Début d'un rendez-vous déplacé ou redimensionné. La grille parle en heure locale : le dimanche d'automne, un
 * rendez-vous de la seconde occurrence de 2 h 30 reste à son instant tant que son heure locale n'a pas bougé,
 * sinon il retomberait une heure plus tôt. `null` : cette heure n'existe pas ce jour-là.
 */
export function instantDeDepose(date: string, heure: string, instantActuel: number): number | null {
  const actuel = localDepuisInstant(instantActuel);
  return actuel.date === date && actuel.heure === heure ? instantActuel : instantSaisi(date, heure);
}

/** Heures toujours affichées, élargies à l'heure pleine si un rendez-vous ou une plage en sort. */
const GRILLE_DEBUT_MINUTES = 8 * 60;
const GRILLE_FIN_MINUTES = 19 * 60;
const MS_PAR_MINUTE = 60_000;

export interface PositionGrille {
  /** Heure locale du début, comme sur la grille : le dimanche d'automne, les deux 2 h 30 s'y superposent. */
  readonly debutMinutes: number;
  /** Durée réelle. */
  readonly dureeMinutes: number;
}

export function positionDansLaGrille({ debut, fin }: Intervalle): PositionGrille {
  return {
    debutMinutes: minutesDepuisMinuit(localDepuisInstant(debut).heure),
    dureeMinutes: (fin - debut) / MS_PAR_MINUTE,
  };
}

/** Bornes de la grille, en minutes depuis minuit, qui englobent tous ces intervalles d'une journée. */
export function bornesGrille(intervalles: readonly Intervalle[]): {
  readonly debut: number;
  readonly fin: number;
} {
  const positions = intervalles.map(positionDansLaGrille);
  const debut = Math.min(GRILLE_DEBUT_MINUTES, ...positions.map((p) => p.debutMinutes));
  const fin = Math.max(
    GRILLE_FIN_MINUTES,
    ...positions.map((p) => p.debutMinutes + p.dureeMinutes),
  );
  return { debut: Math.floor(debut / 60) * 60, fin: Math.min(Math.ceil(fin / 60) * 60, 24 * 60) };
}

export interface Voie {
  /** Rang dans le groupe de rendez-vous qui se chevauchent. */
  readonly rang: number;
  /** Nombre de voies du groupe : la largeur de la carte en dépend. */
  readonly voies: number;
}

/** Répartit côte à côte les rendez-vous qui se chevauchent dans une même colonne. */
export function disposerEnVoies<T extends Intervalle & { readonly id: string }>(
  rdv: readonly T[],
): ReadonlyMap<string, Voie> {
  const tries = rdv.toSorted((a, b) => a.debut - b.debut);
  const resultat = new Map<string, Voie>();
  let groupe: { id: string; rang: number }[] = [];
  let finsParVoie: number[] = [];
  let finGroupe = Number.NEGATIVE_INFINITY;
  const cloreGroupe = () => {
    for (const { id, rang } of groupe) {
      resultat.set(id, { rang, voies: finsParVoie.length });
    }
    groupe = [];
    finsParVoie = [];
  };
  for (const { id, debut, fin } of tries) {
    if (debut >= finGroupe) {
      cloreGroupe();
      finGroupe = fin;
    }
    const libre = finsParVoie.findIndex((finVoie) => finVoie <= debut);
    const rang = libre === -1 ? finsParVoie.length : libre;
    finsParVoie[rang] = fin;
    finGroupe = Math.max(finGroupe, fin);
    groupe.push({ id, rang });
  }
  cloreGroupe();
  return resultat;
}
