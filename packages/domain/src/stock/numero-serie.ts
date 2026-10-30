import { z } from 'zod';

import { retirerEspaces } from '../commun/texte';

export const LONGUEUR_MIN_NUMERO_SERIE = 3;
export const LONGUEUR_MAX_NUMERO_SERIE = 64;

/**
 * Forme canonique : sans espaces, en majuscules. Une douchette se comporte comme un clavier, donc une
 * saisie manuelle et un scan du même numéro donnent la même valeur.
 */
export function normaliserNumeroSerie(saisie: string): string {
  return retirerEspaces(saisie).toUpperCase();
}

function numeroValide(numero: string): boolean {
  return (
    numero.length >= LONGUEUR_MIN_NUMERO_SERIE &&
    numero.length <= LONGUEUR_MAX_NUMERO_SERIE &&
    /^[\x21-\x7e]+$/.test(numero)
  );
}

// Source : convention-audioprothesistes.pdf art. 21, p. 21 (conservation du numéro de série).
// À VÉRIFIER : format réel des numéros et des codes lus par les douchettes (un code GS1 contient plus
// que le numéro de série) ; aucun document de docs/ref ne le définit, d'où un contrôle volontairement large.
export const numeroSerieSchema = z
  .string({ error: 'Le numéro de série est obligatoire.' })
  .transform((saisie, ctx) => {
    const numero = normaliserNumeroSerie(saisie);
    if (!numeroValide(numero)) {
      ctx.addIssue({ code: 'custom', message: `Numéro de série invalide : « ${saisie.trim()} ».` });
      return z.NEVER;
    }
    return numero;
  });

/** Numéros présents plusieurs fois dans une saisie, une seule fois chacun, dans l'ordre de découverte. */
export function doublonsDansLaSaisie(numeros: readonly string[]): string[] {
  const vus = new Set<string>();
  const doublons = new Set<string>();
  for (const numero of numeros) {
    (vus.has(numero) ? doublons : vus).add(numero);
  }
  return [...doublons];
}
