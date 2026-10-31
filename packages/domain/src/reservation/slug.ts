import { z } from 'zod';

import { normaliserPourRecherche } from '../patient/recherche';

const LONGUEUR_MAX_SLUG = 60;

/** `/rdv/lien/…` est la page du lien unique : aucun client ne peut s'y appeler ainsi. */
const SLUGS_RESERVES: readonly string[] = ['lien'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Forme lisible d'un nom pour une URL. Un nom sans lettre ni chiffre donne le `repli`. */
export function slugDepuisNom(nom: string, repli: string): string {
  const slug = normaliserPourRecherche(nom)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, LONGUEUR_MAX_SLUG)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? repli : slug;
}

/** Premier slug libre : le nom, puis `nom-2`, `nom-3`… */
export function slugDisponible(base: string, pris: ReadonlySet<string>): string {
  const libre = (slug: string) => !pris.has(slug) && !SLUGS_RESERVES.includes(slug);
  if (libre(base)) {
    return base;
  }
  let suffixe = 2;
  while (!libre(`${base}-${String(suffixe)}`)) {
    suffixe += 1;
  }
  return `${base}-${String(suffixe)}`;
}

export const slugSchema = z
  .string({ error: 'L’adresse est obligatoire.' })
  .trim()
  .toLowerCase()
  .max(LONGUEUR_MAX_SLUG, `${String(LONGUEUR_MAX_SLUG)} caractères au maximum.`)
  .regex(SLUG, 'Lettres sans accent, chiffres et tirets uniquement.')
  .refine((slug) => !SLUGS_RESERVES.includes(slug), 'Cette adresse est réservée.');
