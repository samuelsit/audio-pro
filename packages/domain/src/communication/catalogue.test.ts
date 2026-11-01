import { describe, expect, it } from 'vitest';

import { estScenarioRdv, FINALITE_SCENARIO, SCENARIOS_COMMUNICATION } from './catalogue';

describe('estScenarioRdv', () => {
  it.each([
    ['RAPPEL_RDV_J2', true],
    ['ANNULATION_RDV', true],
    ['RELANCE_DEVIS', false],
    ['ANNIVERSAIRE', false],
  ] as const)('%s', (scenario, attendu) => {
    expect(estScenarioRdv(scenario)).toBe(attendu);
  });
});

describe('FINALITE_SCENARIO', () => {
  it('range la vente en commercial, le reste en suivi', () => {
    const commerciaux = SCENARIOS_COMMUNICATION.filter(
      (s) => FINALITE_SCENARIO[s] === 'COMMERCIAL',
    );
    expect(commerciaux).toEqual(['RELANCE_DEVIS', 'RENOUVELLEMENT', 'ANNIVERSAIRE']);
  });
});
