// CSV pour tableur français : séparateur « ; », fin de ligne CRLF. Le BOM UTF-8 est ajouté par l'appelant.

export type CelluleCsv = string | number | boolean | null;

export const SEPARATEUR_CSV = ';';

/**
 * Une cellule commençant par = + - @ (ou tabulation, retour chariot) serait interprétée comme une formule
 * par le tableur : on la préfixe d'une apostrophe (injection CSV).
 */
export function celluleCsv(valeur: CelluleCsv): string {
  if (valeur === null) {
    return '';
  }
  let texte = String(valeur);
  if (typeof valeur === 'string' && /^[=+\-@\t\r]/.test(texte)) {
    texte = `'${texte}`;
  }
  return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function ligneCsv(cellules: readonly CelluleCsv[]): string {
  return `${cellules.map(celluleCsv).join(SEPARATEUR_CSV)}\r\n`;
}

export function versCsv(
  entetes: readonly string[],
  lignes: readonly (readonly CelluleCsv[])[],
): string {
  return [entetes, ...lignes].map(ligneCsv).join('');
}
