import { describe, expect, it } from 'vitest';

import {
  PARAMETRES_COMMUNICATION_DEFAUT,
  parametresCommunicationSaisieSchema,
  scenarioSaisieSchema,
} from './parametres';

describe('parametresCommunicationSaisieSchema', () => {
  it('accepte les valeurs par défaut', () => {
    expect(
      parametresCommunicationSaisieSchema.safeParse(PARAMETRES_COMMUNICATION_DEFAUT).success,
    ).toBe(true);
  });

  it('refuse un délai nul', () => {
    const saisie = { ...PARAMETRES_COMMUNICATION_DEFAUT, devisDelaiJours: 0 };
    expect(parametresCommunicationSaisieSchema.safeParse(saisie).success).toBe(false);
  });
});

describe('scenarioSaisieSchema', () => {
  it.each([
    [{ actif: true, canaux: ['SMS', 'EMAIL'] }, true],
    [{ actif: true, canaux: [] }, false],
    [{ actif: true, canaux: ['SMS', 'SMS'] }, false],
    [{ actif: false, canaux: ['PIGEON'] }, false],
  ])('%j', (saisie, attendu) => {
    expect(scenarioSaisieSchema.safeParse(saisie).success).toBe(attendu);
  });
});
