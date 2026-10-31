import { ajouterJours } from '../commun/date';
import { localDepuisInstant } from '../commun/fuseau';

const MS_PAR_MINUTE = 60_000;

export interface RecherchePublique {
  readonly maintenant: number;
  readonly delaiCentreMinutes: number;
  readonly delaiTypeMinutes: number;
  readonly horizonJours: number;
}

export interface FenetreReservation {
  /** Aucun créneau avant cet instant. */
  readonly pasAvant: number;
  /** Dernier jour réservable, inclus. */
  readonly dernierJour: string;
}

/** Le délai le plus long l'emporte : le centre et le type de rendez-vous peuvent exiger chacun le leur. */
export function fenetreReservation(recherche: RecherchePublique): FenetreReservation {
  const { maintenant, delaiCentreMinutes, delaiTypeMinutes, horizonJours } = recherche;
  return {
    pasAvant: maintenant + Math.max(delaiCentreMinutes, delaiTypeMinutes) * MS_PAR_MINUTE,
    dernierJour: ajouterJours(localDepuisInstant(maintenant).date, horizonJours),
  };
}

export function estDansLaFenetre(debut: number, fenetre: FenetreReservation): boolean {
  return debut >= fenetre.pasAvant && localDepuisInstant(debut).date <= fenetre.dernierJour;
}
