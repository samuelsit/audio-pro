import { describe, expect, it } from 'vitest';

import { centimesDepuisMillimes, coutSmsMillimes, statutApresAccuse, suiviAttendu } from './suivi';

describe('suiviAttendu', () => {
  it.each([
    ['ENVOYE', true],
    ['DELIVRE', false],
    ['BLOQUE', false],
  ] as const)('%s', (statut, attendu) => {
    expect(suiviAttendu(statut)).toBe(attendu);
  });
});

describe('statutApresAccuse', () => {
  it.each([
    ['livraison', 'ENVOYE', 'DELIVRE', 'DELIVRE'],
    ['échec', 'ENVOYE', 'ECHEC', 'ECHEC'],
    ['toujours en cours', 'ENVOYE', 'EN_COURS', 'ENVOYE'],
    ['accusé rejoué', 'DELIVRE', 'DELIVRE', 'DELIVRE'],
    ['accusé tardif', 'DELIVRE', 'ECHEC', 'DELIVRE'],
    ['échec définitif', 'ECHEC', 'DELIVRE', 'ECHEC'],
    ['pas encore parti', 'A_ENVOYER', 'DELIVRE', 'A_ENVOYER'],
  ] as const)('%s', (_, actuel, etat, attendu) => {
    expect(statutApresAccuse(actuel, etat)).toBe(attendu);
  });
});

describe('coût', () => {
  it('multiplie les segments par le tarif', () => {
    expect(coutSmsMillimes(3, 45)).toBe(135);
  });

  it('arrondit la somme au centime', () => {
    expect(centimesDepuisMillimes(135)).toBe(14);
    expect(centimesDepuisMillimes(0)).toBe(0);
  });
});
