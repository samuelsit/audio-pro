/** Paramètres de recherche tels que Next les fournit à une page. */
export type ParametresRecherche = Record<string, string | string[] | undefined>;

/** Garde la première valeur de chaque paramètre (une valeur répétée dans l'URL n'est pas attendue). */
export function premieresValeurs(parametres: ParametresRecherche): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(parametres)) {
    const premiere = Array.isArray(valeur) ? valeur[0] : valeur;
    if (premiere !== undefined) {
      resultat[cle] = premiere;
    }
  }
  return resultat;
}

/** URL `chemin?…` avec les paramètres non vides, en remplaçant ceux de `surcharge`. */
export function urlAvecParametres(
  chemin: string,
  parametres: Readonly<Record<string, string>>,
  surcharge: Readonly<Record<string, string | number | undefined>> = {},
): string {
  const recherche = new URLSearchParams();
  for (const [cle, valeur] of Object.entries({ ...parametres, ...surcharge })) {
    if (valeur !== undefined && valeur !== '') {
      recherche.set(cle, String(valeur));
    }
  }
  const texte = recherche.toString();
  return texte ? `${chemin}?${texte}` : chemin;
}
