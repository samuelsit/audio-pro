import { describe, expect, it } from 'vitest';

import { instantDeDepose } from './grille';

describe('instantDeDepose', () => {
  const secondeOccurrence = Date.parse('2027-10-31T01:30:00Z');

  it('garde la seconde occurrence d’automne si l’heure locale ne bouge pas', () => {
    expect(instantDeDepose('2027-10-31', '02:30', secondeOccurrence)).toBe(secondeOccurrence);
  });

  it('résout l’heure saisie dès qu’elle bouge', () => {
    expect(instantDeDepose('2027-10-31', '03:00', secondeOccurrence)).toBe(
      Date.parse('2027-10-31T02:00:00Z'),
    );
  });

  it('change de jour à la même heure', () => {
    expect(instantDeDepose('2027-10-30', '02:30', secondeOccurrence)).toBe(
      Date.parse('2027-10-30T00:30:00Z'),
    );
  });

  it('refuse une heure inexistante', () => {
    expect(instantDeDepose('2027-03-28', '02:30', secondeOccurrence)).toBeNull();
  });
});
