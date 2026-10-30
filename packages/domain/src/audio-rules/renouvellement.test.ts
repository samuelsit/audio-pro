import { describe, expect, it } from 'vitest';

import { eligibiliteRenouvellement, LIBELLES_MOTIFS_RENOUVELLEMENT } from './renouvellement';

describe('eligibiliteRenouvellement', () => {
  it.each([
    {
      cas: 'premier appareillage',
      historique: [],
      oreille: 'DROITE',
      date: '2026-10-30',
      attendu: { eligible: true, dateEligibilite: null, motif: 'PREMIER_APPAREILLAGE' },
    },
    {
      cas: 'veille des 4 ans',
      historique: [{ oreille: 'DROITE', dateDelivrance: '2022-10-31' }],
      oreille: 'DROITE',
      date: '2026-10-30',
      attendu: { eligible: false, dateEligibilite: '2026-10-31', motif: 'DELAI_NON_ECOULE' },
    },
    {
      cas: 'jour anniversaire',
      historique: [{ oreille: 'DROITE', dateDelivrance: '2022-10-30' }],
      oreille: 'DROITE',
      date: '2026-10-30',
      attendu: { eligible: true, dateEligibilite: '2026-10-30', motif: 'DELAI_ECOULE' },
    },
    {
      cas: 'bien après 4 ans',
      historique: [{ oreille: 'GAUCHE', dateDelivrance: '2018-01-15' }],
      oreille: 'GAUCHE',
      date: '2026-10-30',
      attendu: { eligible: true, dateEligibilite: '2022-01-15', motif: 'DELAI_ECOULE' },
    },
    {
      cas: 'l’autre oreille ne compte pas',
      historique: [{ oreille: 'GAUCHE', dateDelivrance: '2025-06-01' }],
      oreille: 'DROITE',
      date: '2026-10-30',
      attendu: { eligible: true, dateEligibilite: null, motif: 'PREMIER_APPAREILLAGE' },
    },
    {
      cas: 'oreilles à des dates différentes',
      historique: [
        { oreille: 'GAUCHE', dateDelivrance: '2025-06-01' },
        { oreille: 'DROITE', dateDelivrance: '2020-06-01' },
      ],
      oreille: 'GAUCHE',
      date: '2026-10-30',
      attendu: { eligible: false, dateEligibilite: '2029-06-01', motif: 'DELAI_NON_ECOULE' },
    },
    {
      cas: 'plusieurs délivrances : la plus récente, quel que soit l’ordre',
      historique: [
        { oreille: 'DROITE', dateDelivrance: '2024-03-01' },
        { oreille: 'DROITE', dateDelivrance: '2016-03-01' },
        { oreille: 'DROITE', dateDelivrance: '2020-03-01' },
      ],
      oreille: 'DROITE',
      date: '2026-10-30',
      attendu: { eligible: false, dateEligibilite: '2028-03-01', motif: 'DELAI_NON_ECOULE' },
    },
    {
      cas: '29 février',
      historique: [{ oreille: 'DROITE', dateDelivrance: '2024-02-29' }],
      oreille: 'DROITE',
      date: '2028-02-29',
      attendu: { eligible: true, dateEligibilite: '2028-02-29', motif: 'DELAI_ECOULE' },
    },
  ] as const)('$cas', ({ historique, oreille, date, attendu }) => {
    expect(eligibiliteRenouvellement({ historiqueDelivrances: historique, oreille, date })).toEqual(
      attendu,
    );
  });

  it('chaque motif a un libellé', () => {
    expect(Object.keys(LIBELLES_MOTIFS_RENOUVELLEMENT).sort()).toEqual([
      'DELAI_ECOULE',
      'DELAI_NON_ECOULE',
      'PREMIER_APPAREILLAGE',
    ]);
  });
});
