import { describe, expect, it } from 'vitest';

import { bornesNaissance, campagneSaisieSchema, segmentSchema } from './segment';

const CENTRE = '0190a000-0000-7000-8000-000000000001';
const SEGMENT = { centreIds: [CENTRE] };

describe('segmentSchema', () => {
  it('complète les critères absents', () => {
    expect(segmentSchema.parse(SEGMENT)).toEqual({
      centreIds: [CENTRE],
      ageMin: null,
      ageMax: null,
      appareilleDepuis: null,
      appareilleJusquAu: null,
      classes: [],
      statutsDossier: [],
    });
  });

  it.each([
    ['sans centre', { centreIds: [] }],
    ['âges inversés', { ...SEGMENT, ageMin: 80, ageMax: 60 }],
    [
      'période inversée',
      { ...SEGMENT, appareilleDepuis: '2027-02-01', appareilleJusquAu: '2026-01-01' },
    ],
    ['classe inconnue', { ...SEGMENT, classes: ['CLASSE_III'] }],
    ['statut inconnu', { ...SEGMENT, statutsDossier: ['PERDU'] }],
  ])('refuse : %s', (_, saisie) => {
    expect(segmentSchema.safeParse(saisie).success).toBe(false);
  });

  it('accepte des bornes égales', () => {
    const saisie = {
      ...SEGMENT,
      ageMin: 70,
      ageMax: 70,
      appareilleDepuis: '2026-01-01',
      appareilleJusquAu: '2026-01-01',
    };
    expect(segmentSchema.safeParse(saisie).success).toBe(true);
  });
});

describe('bornesNaissance', () => {
  it.each([
    ['sans âge', null, null, null, null],
    ['65 ans au moins', 65, null, null, '1962-02-01'],
    ['80 ans au plus', null, 80, '1946-02-02', null],
    ['tranche', 65, 80, '1946-02-02', '1962-02-01'],
  ])('%s', (_, ageMin, ageMax, neAuPlusTot, neAuPlusTard) => {
    expect(bornesNaissance({ ageMin, ageMax }, '2027-02-01')).toEqual({
      neAuPlusTot,
      neAuPlusTard,
    });
  });
});

describe('campagneSaisieSchema', () => {
  const saisie = {
    nom: 'Printemps',
    modeleId: '0190a000-0000-7000-8000-000000000002',
    canal: 'SMS',
    segment: SEGMENT,
  };

  it('lance tout de suite sans date', () => {
    expect(campagneSaisieSchema.parse(saisie).programmeeLe).toBeNull();
  });

  it('accepte une date programmée', () => {
    const programmee = { ...saisie, programmeeLe: '2027-02-01T09:00:00+01:00' };
    expect(campagneSaisieSchema.parse(programmee).programmeeLe).toBe('2027-02-01T09:00:00+01:00');
  });

  it('refuse un canal inconnu', () => {
    expect(campagneSaisieSchema.safeParse({ ...saisie, canal: 'FAX' }).success).toBe(false);
  });
});
