import { instantSaisi, localDepuisInstant } from '../commun/fuseau';

/**
 * Début d'un rendez-vous déplacé ou redimensionné. La grille parle en heure locale : le dimanche d'automne, un
 * rendez-vous de la seconde occurrence de 2 h 30 reste à son instant tant que son heure locale n'a pas bougé,
 * sinon il retomberait une heure plus tôt. `null` : cette heure n'existe pas ce jour-là.
 */
export function instantDeDepose(date: string, heure: string, instantActuel: number): number | null {
  const actuel = localDepuisInstant(instantActuel);
  return actuel.date === date && actuel.heure === heure ? instantActuel : instantSaisi(date, heure);
}
