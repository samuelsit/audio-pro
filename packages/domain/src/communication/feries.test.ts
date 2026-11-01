import { describe, expect, it } from 'vitest';

import { dimanchePaques, estFerie } from './feries';

describe('dimanchePaques', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('%i', (annee, attendu) => {
    expect(dimanchePaques(annee)).toBe(attendu);
  });
});

describe('estFerie', () => {
  it.each([
    ['2027-01-01', true],
    ['2027-05-01', true],
    ['2027-05-08', true],
    ['2027-07-14', true],
    ['2027-08-15', true],
    ['2027-11-01', true],
    ['2027-11-11', true],
    ['2027-12-25', true],
    ['2027-03-29', true],
    ['2027-05-06', true],
    ['2027-05-17', true],
    ['2027-03-28', false],
    ['2027-06-02', false],
  ])('%s', (date, attendu) => {
    expect(estFerie(date)).toBe(attendu);
  });
});
