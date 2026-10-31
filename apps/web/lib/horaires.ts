import { JOURS_SEMAINE, PLAGES_PAR_JOUR, type HorairesOuverture } from '@ha/domain';

import { texte } from './formulaire';

/** Plages renseignées de la grille des horaires ; une plage incomplète est refusée par le domaine. */
export function horaires(formData: FormData) {
  const plages = (jour: keyof HorairesOuverture) =>
    Array.from({ length: PLAGES_PAR_JOUR }, (_, i) => ({
      debut: texte(formData, `${jour}-${i}-debut`),
      fin: texte(formData, `${jour}-${i}-fin`),
    })).filter((plage) => plage.debut !== '' || plage.fin !== '');
  return Object.fromEntries(JOURS_SEMAINE.map((jour) => [jour, plages(jour)]));
}

/** Heures saisies, pour les réafficher si le formulaire est refusé. */
export function heuresSaisies(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].flatMap(([nom, valeur]) =>
      /-(debut|fin)$/.test(nom) && typeof valeur === 'string' ? [[nom, valeur]] : [],
    ),
  );
}
