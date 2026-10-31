import type { Creneau } from '../agenda/creneaux';
import { localDepuisInstant } from '../commun/fuseau';

/** Heure proposée au patient, tous praticiens confondus : il choisit un horaire, pas une ressource. */
export interface InstantDisponible {
  readonly debut: number;
  readonly fin: number;
  readonly date: string;
  readonly heure: string;
  /** Praticiens libres à cet instant, vide pour un type sans praticien. */
  readonly praticienIds: readonly string[];
}

/** Regroupe par début : `calculerCreneauxLibres` rend une entrée par praticien libre au même instant. */
export function instantsDisponibles(creneaux: readonly Creneau[]): InstantDisponible[] {
  const parDebut = new Map<number, { fin: number; praticienIds: string[] }>();
  for (const { debut, fin, praticienId } of creneaux) {
    const instant = parDebut.get(debut) ?? { fin, praticienIds: [] };
    parDebut.set(debut, instant);
    if (praticienId !== null) {
      instant.praticienIds.push(praticienId);
    }
  }
  return [...parDebut.entries()].map(([debut, { fin, praticienIds }]) => ({
    debut,
    fin,
    ...localDepuisInstant(debut),
    praticienIds,
  }));
}
