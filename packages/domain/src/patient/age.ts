function decomposer(date: string): [number, number, number] {
  const [annee = 0, mois = 0, jour = 0] = date.split('-').map(Number);
  return [annee, mois, jour];
}

/**
 * Âge en années révolues à `dateReference` (dates calendaires AAAA-MM-JJ déjà validées).
 * Servira aux règles « moins de 20 ans / 20 ans et plus » (étape 6).
 * Né un 29 février : l'anniversaire est atteint le 1er mars les années non bissextiles.
 * À VÉRIFIER : convention du 29 février absente de docs/ref.
 */
export function ageAt(dateNaissance: string, dateReference: string): number {
  if (dateReference < dateNaissance) {
    throw new RangeError('La date de référence précède la date de naissance.');
  }
  const [anneeN, moisN, jourN] = decomposer(dateNaissance);
  const [anneeR, moisR, jourR] = decomposer(dateReference);
  const anniversairePasse = moisR > moisN || (moisR === moisN && jourR >= jourN);
  return anneeR - anneeN - (anniversairePasse ? 0 : 1);
}
