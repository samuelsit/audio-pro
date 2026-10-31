import { describe, expect, it } from 'vitest';

import { oreillesConcernees, oreillesDuDossier, typeGlobal } from './oreilles';

describe('oreillesConcernees', () => {
  it.each([
    { oreilles: 'DROITE', attendu: ['DROITE'] },
    { oreilles: 'GAUCHE', attendu: ['GAUCHE'] },
    { oreilles: 'LES_DEUX', attendu: ['DROITE', 'GAUCHE'] },
  ] as const)('$oreilles', ({ oreilles, attendu }) => {
    expect(oreillesConcernees(oreilles)).toEqual(attendu);
  });
});

describe('oreillesDuDossier et typeGlobal', () => {
  it.each([
    { typeDroite: 'PRIMO', typeGauche: null, oreilles: ['DROITE'], global: 'PRIMO' },
    {
      typeDroite: null,
      typeGauche: 'RENOUVELLEMENT',
      oreilles: ['GAUCHE'],
      global: 'RENOUVELLEMENT',
    },
    { typeDroite: 'PRIMO', typeGauche: 'PRIMO', oreilles: ['DROITE', 'GAUCHE'], global: 'PRIMO' },
    {
      typeDroite: 'RENOUVELLEMENT',
      typeGauche: 'PRIMO',
      oreilles: ['DROITE', 'GAUCHE'],
      global: 'MIXTE',
    },
    { typeDroite: null, typeGauche: null, oreilles: [], global: null },
  ] as const)('$typeDroite / $typeGauche', ({ typeDroite, typeGauche, oreilles, global }) => {
    const types = { typeDroite, typeGauche };
    expect(oreillesDuDossier(types).map((o) => o.oreille)).toEqual(oreilles);
    expect(typeGlobal(types)).toBe(global);
  });
});
