import { z } from 'zod';

import { retirerEspaces } from '../commun/texte';

// NIR : 13 caractères (sexe, année, mois, département, commune, ordre) suivis d'une clé de 2 chiffres.
// Source : spécification de l'étape 3 (« 13 caractères + clé de 2 chiffres, contrôle de la clé,
// cas de la Corse 2A/2B »).
// À VÉRIFIER : la structure du NIR, l'algorithme de la clé (97 − N mod 97), la substitution
// 2A → 19 / 2B → 18 et les premiers caractères admis (1, 2, 3, 4, 7, 8) ne figurent pas dans docs/ref.
const FORME_NIR = /^[1-478]\d{4}(?:\d{2}|2[AB])\d{8}$/;

const MESSAGE_FORMAT = 'Le NIR doit comporter 13 caractères suivis d’une clé de 2 chiffres.';
const MESSAGE_CLE = 'La clé du NIR ne correspond pas au numéro : vérifiez la saisie.';

/** Saisie normalisée : espaces retirés, majuscules (« 2a » → « 2A »). */
export function normaliserNir(saisie: string): string {
  return retirerEspaces(saisie).toUpperCase();
}

/**
 * Clé de contrôle d'un NIR de 13 caractères (sans la clé), de forme déjà vérifiée.
 * Source et réserves : voir l'en-tête du fichier (À VÉRIFIER).
 */
export function cleNir(nir13: string): number {
  const departement = nir13.slice(5, 7);
  const substitution = departement === '2A' ? '19' : departement === '2B' ? '18' : departement;
  const numerique = Number(`${nir13.slice(0, 5)}${substitution}${nir13.slice(7, 13)}`);
  return 97 - (numerique % 97);
}

/** NIR complet (15 caractères, clé comprise), normalisé et contrôlé. */
export const nirSchema = z
  .string({ error: 'Le NIR est obligatoire.' })
  .transform(normaliserNir)
  .pipe(
    z
      .string()
      .regex(FORME_NIR, { error: MESSAGE_FORMAT, abort: true })
      .refine((nir) => cleNir(nir.slice(0, 13)) === Number(nir.slice(13)), MESSAGE_CLE),
  )
  .brand<'Nir'>();
export type Nir = z.infer<typeof nirSchema>;

export function estNirValide(saisie: string): boolean {
  return nirSchema.safeParse(saisie).success;
}

/** Les 13 caractères sans la clé : base de l'empreinte de recherche (la clé n'apporte rien de plus). */
export function nirSansCle(nir: Nir): string {
  return nir.slice(0, 13);
}

/** Affichage groupé : « 1 85 05 2A 123 456 78 ». */
export function formaterNir(nir: string): string {
  const n = normaliserNir(nir);
  return [
    n.slice(0, 1),
    n.slice(1, 3),
    n.slice(3, 5),
    n.slice(5, 7),
    n.slice(7, 10),
    n.slice(10, 13),
    n.slice(13),
  ]
    .filter((partie) => partie !== '')
    .join(' ');
}
