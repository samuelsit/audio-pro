import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import {
  centresExerciceHorsRattachement,
  peutEtrePraticien,
  praticienSaisieSchema,
} from './praticien';

describe('peutEtrePraticien', () => {
  it.each(ROLES.map((role) => ({ role, attendu: role === 'AUDIO' })))(
    '$role → $attendu',
    ({ role, attendu }) => {
      expect(peutEtrePraticien(role)).toBe(attendu);
    },
  );
});

describe('centresExerciceHorsRattachement', () => {
  it.each([
    { exercice: ['A'], rattachement: ['A', 'B'], attendu: [] },
    { exercice: ['A', 'B'], rattachement: ['A', 'B'], attendu: [] },
    { exercice: ['A', 'C'], rattachement: ['A', 'B'], attendu: ['C'] },
    { exercice: ['C'], rattachement: [], attendu: ['C'] },
    { exercice: [], rattachement: ['A'], attendu: [] },
  ])('$exercice ⊄ $rattachement → $attendu', ({ exercice, rattachement, attendu }) => {
    expect(centresExerciceHorsRattachement(exercice, rattachement)).toEqual(attendu);
  });
});

describe('praticienSaisieSchema', () => {
  const base = { utilisateurId: 'u1', rpps: '100 000 000 01', adeli: '', centreIds: ['A', 'A'] };

  it('normalise une saisie valide', () => {
    expect(praticienSaisieSchema.parse(base)).toEqual({
      utilisateurId: 'u1',
      rpps: '10000000001',
      adeli: null,
      centreIds: ['A'],
    });
  });

  it.each([
    {
      cas: 'sans utilisateur',
      saisie: { ...base, utilisateurId: '' },
      message: 'Choisir un audioprothésiste.',
    },
    {
      cas: 'utilisateur absent',
      saisie: { ...base, utilisateurId: undefined },
      message: 'Choisir un audioprothésiste.',
    },
    {
      cas: 'RPPS invalide',
      saisie: { ...base, rpps: '123' },
      message: 'Le numéro RPPS doit comporter exactement 11 chiffres.',
    },
    {
      cas: 'sans centre',
      saisie: { ...base, centreIds: [] },
      message: 'Choisir au moins un centre d’exercice.',
    },
  ])('refuse : $cas', ({ saisie, message }) => {
    expect(praticienSaisieSchema.safeParse(saisie).error?.issues[0]?.message).toBe(message);
  });
});
