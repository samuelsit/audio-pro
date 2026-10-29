import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';

/**
 * Forme de comparaison d'un nom ou d'un prénom : sans accents, en majuscules, tirets, apostrophes et
 * points remplacés par des espaces, espaces réduits. « d’Hérouville-Saint-Clair » → « D HEROUVILLE SAINT CLAIR ».
 */
export function normaliserPourRecherche(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/Œ/g, 'OE')
    .replace(/Æ/g, 'AE')
    .replace(/['’‘`\-‐–.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Date saisie en JJ/MM/AAAA (usage courant) ou AAAA-MM-JJ, rendue en ISO. */
export const dateSaisieSchema = z
  .string({ error: 'Date invalide.' })
  .trim()
  .transform((valeur) => {
    const francaise = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valeur);
    if (!francaise) {
      return valeur;
    }
    const [, jour = '', mois = '', annee = ''] = francaise;
    return `${annee}-${mois.padStart(2, '0')}-${jour.padStart(2, '0')}`;
  })
  .pipe(dateCalendaireSchema);

/** Critère facultatif d'URL : absent, vide ou invalide → `undefined` (on ne bloque pas une liste). */
function critere<S extends z.ZodType>(schema: S) {
  return z.preprocess(
    (valeur) => (typeof valeur === 'string' && valeur.trim() !== '' ? valeur : undefined),
    schema.optional().catch(undefined),
  );
}

const texteRecherche = z
  .string()
  .transform(normaliserPourRecherche)
  .pipe(z.string().min(1).max(100));

/**
 * Critères de la liste des patients (paramètres d'URL). Le NIR n'y figure jamais : seule son empreinte
 * (calculée côté serveur) peut être passée.
 */
export const criteresRecherchePatientSchema = z.object({
  nom: critere(texteRecherche),
  prenom: critere(texteRecherche),
  dateNaissance: critere(dateSaisieSchema),
  empreinte: critere(z.string().regex(/^[0-9a-f]{64}$/)),
  page: pageSchema,
});
export type CriteresRecherchePatient = z.output<typeof criteresRecherchePatientSchema>;
