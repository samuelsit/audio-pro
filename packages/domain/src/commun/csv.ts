import type { z } from 'zod';

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

export interface LigneCsvLue {
  /** Numéro de la ligne dans le fichier, en partant de 1. */
  readonly numero: number;
  readonly cellules: readonly string[];
}

/**
 * Découpe un CSV en lignes et cellules : BOM ignoré, guillemets doublés, fins de ligne CRLF ou LF.
 * Les lignes vides sont sautées. `null` si un guillemet n'est pas refermé.
 */
export function lireCsv(texte: string): LigneCsvLue[] | null {
  const source = texte.replace(/^\uFEFF/, '');
  const lignes: LigneCsvLue[] = [];
  let cellules: string[] = [];
  let cellule = '';
  let entreGuillemets = false;
  let numero = 1;
  let debut = 1;

  const terminerLigne = () => {
    cellules.push(cellule);
    if (cellules.some((c) => c.trim() !== '')) {
      lignes.push({ numero: debut, cellules });
    }
    cellules = [];
    cellule = '';
  };

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (entreGuillemets) {
      if (c === '"' && source[i + 1] === '"') {
        cellule += '"';
        i += 1;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        numero += c === '\n' ? 1 : 0;
        cellule += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === SEPARATEUR_CSV) {
      cellules.push(cellule);
      cellule = '';
    } else if (c === '\n') {
      terminerLigne();
      numero += 1;
      debut = numero;
    } else if (c !== '\r') {
      cellule += c;
    }
  }
  if (entreGuillemets) {
    return null;
  }
  terminerLigne();
  return lignes;
}

export interface ErreurLigneCsv {
  readonly ligne: number;
  readonly message: string;
}

export interface LigneCsvValidee<T> {
  readonly ligne: number;
  readonly valeur: T;
}

export interface ResultatCsv<T> {
  readonly lignes: readonly LigneCsvValidee<T>[];
  readonly erreurs: readonly ErreurLigneCsv[];
}

/** Lit un CSV dont l'en-tête est imposé et valide chaque ligne ; les erreurs sont listées par ligne. */
export function interpreterCsv<S extends z.ZodType>(
  texte: string,
  entetes: readonly string[],
  schema: S,
): ResultatCsv<z.output<S>> {
  const lues = lireCsv(texte);
  if (lues === null) {
    return {
      lignes: [],
      erreurs: [{ ligne: 1, message: 'Guillemet non refermé dans le fichier.' }],
    };
  }
  const [enTete, ...donnees] = lues;
  const attendu = entetes.join(SEPARATEUR_CSV);
  if (enTete?.cellules.map((c) => c.trim().toLowerCase()).join(SEPARATEUR_CSV) !== attendu) {
    return { lignes: [], erreurs: [{ ligne: 1, message: `En-tête attendu : ${attendu}` }] };
  }

  const lignes: LigneCsvValidee<z.output<S>>[] = [];
  const erreurs: ErreurLigneCsv[] = [];
  for (const { numero, cellules } of donnees) {
    if (cellules.length !== entetes.length) {
      erreurs.push({ ligne: numero, message: `${entetes.length} colonnes attendues.` });
      continue;
    }
    const resultat = schema.safeParse(
      Object.fromEntries(entetes.map((entete, i) => [entete, cellules[i]?.trim()])),
    );
    if (resultat.success) {
      lignes.push({ ligne: numero, valeur: resultat.data });
    } else {
      erreurs.push(
        ...resultat.error.issues.map((issue) => ({
          ligne: numero,
          message: `${issue.path.join('.')} : ${issue.message}`,
        })),
      );
    }
  }
  return { lignes, erreurs };
}
