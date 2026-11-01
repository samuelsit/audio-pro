import { describe, expect, it } from 'vitest';

import { PARAMETRES_SAV_DEFAUT, parametresSavSaisieSchema } from './parametres';

const VALIDE = {
  dureeGarantieMois: '60',
  suiviMois: '3, 6, 12',
  suiviParAn: '2',
  pretDureeJours: '30',
};

describe('parametresSavSaisieSchema', () => {
  it('lit la saisie', () => {
    expect(parametresSavSaisieSchema.parse(VALIDE)).toEqual({
      dureeGarantieMois: 60,
      suiviMois: [3, 6, 12],
      suiviParAn: 2,
      pretDureeJours: 30,
    });
  });

  it('les valeurs par défaut sont valides', () => {
    const saisie = {
      ...PARAMETRES_SAV_DEFAUT,
      suiviMois: PARAMETRES_SAV_DEFAUT.suiviMois.join(' '),
    };
    expect(parametresSavSaisieSchema.parse(saisie)).toEqual(PARAMETRES_SAV_DEFAUT);
  });

  it('refuse une garantie sous le minimum de 4 ans', () => {
    expect(parametresSavSaisieSchema.safeParse({ ...VALIDE, dureeGarantieMois: '47' }).success).toBe(
      false,
    );
  });

  it.each(['', '6, 3', '3, 3', '0', '61', '3,x'])('refuse le rythme « %s »', (suiviMois) => {
    expect(parametresSavSaisieSchema.safeParse({ ...VALIDE, suiviMois }).success).toBe(false);
  });
});
