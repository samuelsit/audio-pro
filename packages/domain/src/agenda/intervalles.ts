/** Intervalle de temps, fin exclue, en millisecondes depuis l'époque. */
export interface Intervalle {
  readonly debut: number;
  readonly fin: number;
}

export function seChevauchent(a: Intervalle, b: Intervalle): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

/** Trie et fusionne : le résultat est croissant, sans chevauchement ni intervalle vide. */
export function unir(intervalles: readonly Intervalle[]): Intervalle[] {
  const tries = intervalles
    .filter(({ debut, fin }) => debut < fin)
    .toSorted((a, b) => a.debut - b.debut);
  const resultat: Intervalle[] = [];
  for (const intervalle of tries) {
    const dernier = resultat.at(-1);
    if (dernier !== undefined && intervalle.debut <= dernier.fin) {
      resultat[resultat.length - 1] = {
        debut: dernier.debut,
        fin: Math.max(dernier.fin, intervalle.fin),
      };
    } else {
      resultat.push(intervalle);
    }
  }
  return resultat;
}

/** Ce qui reste de `base` une fois `retraits` ôtés. */
export function soustraire(
  base: readonly Intervalle[],
  retraits: readonly Intervalle[],
): Intervalle[] {
  let restes = unir(base);
  for (const retrait of retraits) {
    restes = restes.flatMap(({ debut, fin }) =>
      [
        { debut, fin: Math.min(fin, retrait.debut) },
        { debut: Math.max(debut, retrait.fin), fin },
      ].filter((reste) => reste.debut < reste.fin),
    );
  }
  return restes;
}

export function intersecter(a: readonly Intervalle[], b: readonly Intervalle[]): Intervalle[] {
  return unir(
    a.flatMap((x) =>
      b.map((y) => ({ debut: Math.max(x.debut, y.debut), fin: Math.min(x.fin, y.fin) })),
    ),
  );
}

/** Vrai si `intervalle` tient entier dans une seule plage. */
export function contient(plages: readonly Intervalle[], intervalle: Intervalle): boolean {
  return unir(plages).some(({ debut, fin }) => debut <= intervalle.debut && intervalle.fin <= fin);
}
