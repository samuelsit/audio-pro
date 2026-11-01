import { z } from 'zod';

import { entierEntre } from '../commandes/parametres';
import { DUREE_GARANTIE_MINIMALE_MOIS } from './garantie';

export interface ParametresSav {
  readonly dureeGarantieMois: number;
  /** Mois des contrôles de la première période, depuis la délivrance. */
  readonly suiviMois: readonly number[];
  /** Contrôles par an une fois cette période passée. */
  readonly suiviParAn: number;
  readonly pretDureeJours: number;
}

/**
 * Sans ligne en base. Source : modele-devis-audio.pdf p. 2 § 4 (4 ans ; contrôles aux 3e, 6e et 12e mois, puis
 * au moins deux par an) ; convention-audioprothesistes.pdf, art. 19, p. 20-21. Le prêt est un choix de gestion.
 */
export const PARAMETRES_SAV_DEFAUT: ParametresSav = {
  dureeGarantieMois: DUREE_GARANTIE_MINIMALE_MOIS,
  suiviMois: [3, 6, 12],
  suiviParAn: 2,
  pretDureeJours: 30,
};

const MOIS_SUIVI_MAX = 60;

const suiviMoisSchema = z.string().transform((saisie, ctx) => {
  const mois = saisie
    .split(/[\s,;]+/)
    .filter((morceau) => morceau !== '')
    .map(Number);
  const valide =
    mois.length > 0 &&
    mois.every(
      (m, i) => Number.isInteger(m) && m >= 1 && m <= MOIS_SUIVI_MAX && m > (mois[i - 1] ?? 0),
    );
  if (!valide) {
    ctx.addIssue({ code: 'custom', message: 'Saisir des mois croissants, par exemple 3, 6, 12.' });
    return z.NEVER;
  }
  return mois;
});

export const parametresSavSaisieSchema = z.object({
  dureeGarantieMois: entierEntre(DUREE_GARANTIE_MINIMALE_MOIS, 240),
  suiviMois: suiviMoisSchema,
  suiviParAn: entierEntre(0, 12),
  pretDureeJours: entierEntre(1, 365),
});
