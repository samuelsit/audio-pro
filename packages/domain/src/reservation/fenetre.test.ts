import { describe, expect, it } from 'vitest';

import { estDansLaFenetre, fenetreReservation } from './fenetre';

const MAINTENANT = Date.parse('2027-01-11T10:00:00+01:00');
const t = (texte: string) => Date.parse(texte);
const REGLES = {
  maintenant: MAINTENANT,
  delaiCentreMinutes: 120,
  delaiTypeMinutes: 60,
  horizonJours: 30,
};

describe('fenetreReservation', () => {
  it.each([
    {
      cas: 'délai du centre plus long',
      centre: 120,
      type: 60,
      attendu: '2027-01-11T12:00:00+01:00',
    },
    {
      cas: 'délai du type plus long',
      centre: 60,
      type: 1440,
      attendu: '2027-01-12T10:00:00+01:00',
    },
    { cas: 'aucun délai', centre: 0, type: 0, attendu: '2027-01-11T10:00:00+01:00' },
  ])('$cas', ({ centre, type, attendu }) => {
    const { pasAvant } = fenetreReservation({
      ...REGLES,
      delaiCentreMinutes: centre,
      delaiTypeMinutes: type,
    });
    expect(pasAvant).toBe(t(attendu));
  });

  it('compte l’horizon en jours calendaires de Paris', () => {
    expect(fenetreReservation(REGLES).dernierJour).toBe('2027-02-10');
    const tardSoir = Date.parse('2027-01-11T23:30:00Z');
    expect(fenetreReservation({ ...REGLES, maintenant: tardSoir }).dernierJour).toBe('2027-02-11');
  });
});

describe('estDansLaFenetre', () => {
  const fenetre = fenetreReservation(REGLES);

  it.each([
    { cas: 'avant le délai minimal', debut: '2027-01-11T11:45:00+01:00', attendu: false },
    { cas: 'exactement au délai minimal', debut: '2027-01-11T12:00:00+01:00', attendu: true },
    { cas: 'dernier jour de l’horizon', debut: '2027-02-10T23:45:00+01:00', attendu: true },
    { cas: 'lendemain de l’horizon', debut: '2027-02-11T00:00:00+01:00', attendu: false },
  ])('$cas', ({ debut, attendu }) => {
    expect(estDansLaFenetre(t(debut), fenetre)).toBe(attendu);
  });
});
