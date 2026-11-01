import { describe, expect, it } from 'vitest';

import { instantDePlage, localDepuisInstant } from '../commun/fuseau';
import {
  estDansPlage,
  jourOuvertEnvoi,
  PLAGE_ENVOI_DEFAUT,
  plageEnvoiSchema,
  prochainCreneau,
} from './plage-envoi';

const instant = (date: string, heure: string): number => instantDePlage(date, heure, 'DEBUT');

describe('jourOuvertEnvoi', () => {
  it.each([
    ['lundi', '2027-02-01', PLAGE_ENVOI_DEFAUT, true],
    ['samedi', '2027-02-06', PLAGE_ENVOI_DEFAUT, true],
    ['dimanche', '2027-02-07', PLAGE_ENVOI_DEFAUT, false],
    ['férié un lundi', '2027-03-29', PLAGE_ENVOI_DEFAUT, false],
    ['férié autorisé', '2027-03-29', { ...PLAGE_ENVOI_DEFAUT, feries: true }, true],
  ])('%s', (_, date, plage, attendu) => {
    expect(jourOuvertEnvoi(plage, date)).toBe(attendu);
  });
});

describe('estDansPlage', () => {
  it.each([
    ['à l’ouverture', '2027-02-01', '09:00', true],
    ['juste avant', '2027-02-01', '08:59', false],
    ['en journée', '2027-02-01', '14:30', true],
    ['dernière minute', '2027-02-01', '18:59', true],
    ['à la fermeture', '2027-02-01', '19:00', false],
    ['un dimanche', '2027-02-07', '10:00', false],
    ['un jour férié', '2027-05-06', '10:00', false],
  ])('%s', (_, date, heure, attendu) => {
    expect(estDansPlage(PLAGE_ENVOI_DEFAUT, instant(date, heure))).toBe(attendu);
  });

  it('compte en heure de Paris, en été comme en hiver', () => {
    expect(estDansPlage(PLAGE_ENVOI_DEFAUT, Date.UTC(2027, 6, 1, 7, 0))).toBe(true);
    expect(estDansPlage(PLAGE_ENVOI_DEFAUT, Date.UTC(2027, 0, 4, 7, 0))).toBe(false);
  });
});

describe('prochainCreneau', () => {
  it.each([
    ['dans la plage, tout de suite', '2027-02-01', '14:00', '2027-02-01', '14:00'],
    ['avant l’ouverture, le jour même', '2027-02-01', '07:00', '2027-02-01', '09:00'],
    ['le soir, le lendemain', '2027-02-01', '20:00', '2027-02-02', '09:00'],
    ['samedi soir, lundi matin', '2027-02-06', '19:30', '2027-02-08', '09:00'],
    ['veille de férié', '2027-03-27', '20:00', '2027-03-30', '09:00'],
  ])('%s', (_, date, heure, dateAttendue, heureAttendue) => {
    const creneau = prochainCreneau(PLAGE_ENVOI_DEFAUT, instant(date, heure));
    expect(localDepuisInstant(creneau as number)).toEqual({
      date: dateAttendue,
      heure: heureAttendue,
    });
  });

  it('rend null quand aucun jour ne s’ouvre', () => {
    const fermee = { ...PLAGE_ENVOI_DEFAUT, jours: [] };
    expect(prochainCreneau(fermee, instant('2027-02-01', '10:00'))).toBeNull();
  });
});

describe('plageEnvoiSchema', () => {
  it('accepte la plage par défaut', () => {
    expect(plageEnvoiSchema.safeParse(PLAGE_ENVOI_DEFAUT).success).toBe(true);
  });

  it.each([
    ['heures inversées', { ...PLAGE_ENVOI_DEFAUT, heureDebut: '20:00' }],
    ['heure impossible', { ...PLAGE_ENVOI_DEFAUT, heureFin: '25:00' }],
    ['aucun jour', { ...PLAGE_ENVOI_DEFAUT, jours: [] }],
  ])('refuse : %s', (_, plage) => {
    expect(plageEnvoiSchema.safeParse(plage).success).toBe(false);
  });
});
