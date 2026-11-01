import { describe, expect, it } from 'vitest';

import { PARAMETRES_SAV_DEFAUT } from './parametres';
import {
  clefCreneau,
  controlesAPlanifier,
  ignoranceControleSchema,
  lireCreneau,
  moisDesControles,
  planificationControleSchema,
} from './suivi';

const P = PARAMETRES_SAV_DEFAUT;
const DROITE = { dateDelivrance: '2026-01-15', oreille: 'DROITE' };
const GAUCHE = { dateDelivrance: '2026-01-15', oreille: 'GAUCHE' };

describe('moisDesControles', () => {
  it.each([
    { parametres: P, horizon: 2, attendu: [] },
    { parametres: P, horizon: 12, attendu: [3, 6, 12] },
    { parametres: P, horizon: 30, attendu: [3, 6, 12, 18, 24, 30] },
    { parametres: { ...P, suiviParAn: 1 }, horizon: 36, attendu: [3, 6, 12, 24, 36] },
    { parametres: { ...P, suiviParAn: 0 }, horizon: 36, attendu: [3, 6, 12] },
    { parametres: { ...P, suiviMois: [1, 2] }, horizon: 8, attendu: [1, 2, 8] },
    { parametres: { ...P, suiviMois: [], suiviParAn: 0 }, horizon: 8, attendu: [] },
    { parametres: { ...P, suiviMois: [] }, horizon: 6, attendu: [6] },
  ])('horizon $horizon : $attendu', ({ parametres, horizon, attendu }) => {
    expect(moisDesControles(parametres, horizon)).toEqual(attendu);
  });
});

describe('controlesAPlanifier', () => {
  it('propose le 3e mois un mois avant son échéance, pas plus tôt', () => {
    expect(controlesAPlanifier([DROITE], P, [], '2026-03-15')).toEqual([]);
    expect(controlesAPlanifier([DROITE], P, [], '2026-03-16')).toEqual([
      {
        dateReference: '2026-01-15',
        rang: 1,
        mois: 3,
        datePrevue: '2026-04-15',
        enRetard: false,
      },
    ]);
  });

  it('un appareillage bilatéral compte pour un seul suivi', () => {
    expect(controlesAPlanifier([DROITE, GAUCHE], P, [], '2026-04-15')).toHaveLength(1);
  });

  it('signale un contrôle dépassé', () => {
    const [controle] = controlesAPlanifier([DROITE], P, [], '2026-04-16');
    expect(controle).toMatchObject({ rang: 1, enRetard: true });
  });

  it('écarte un contrôle traité et propose le suivant', () => {
    const traites = [{ dateReference: '2026-01-15', rang: 1 }];
    expect(controlesAPlanifier([DROITE], P, traites, '2026-07-01')).toMatchObject([
      { rang: 2, mois: 6 },
    ]);
  });

  it('un contrôle manqué depuis plus d’un an ne se propose plus', () => {
    const rangs = controlesAPlanifier([DROITE], P, [], '2027-05-01').map((c) => c.rang);
    expect(rangs).toEqual([2, 3]);
  });

  it('continue au-delà de la première année', () => {
    const traites = [1, 2, 3].map((rang) => ({ dateReference: '2026-01-15', rang }));
    expect(controlesAPlanifier([DROITE], P, traites, '2027-07-15')).toMatchObject([
      { rang: 4, mois: 18, datePrevue: '2027-07-15' },
    ]);
  });

  it('un renouvellement des deux oreilles clôt l’ancien suivi', () => {
    const recent = [
      { dateDelivrance: '2030-01-15', oreille: 'DROITE' },
      { dateDelivrance: '2030-01-15', oreille: 'GAUCHE' },
    ];
    const controles = controlesAPlanifier([DROITE, GAUCHE, ...recent], P, [], '2030-04-15');
    expect(new Set(controles.map((c) => c.dateReference))).toEqual(new Set(['2030-01-15']));
  });

  it('un renouvellement d’une oreille laisse l’autre suivie', () => {
    const recent = { dateDelivrance: '2030-01-15', oreille: 'DROITE' };
    const controles = controlesAPlanifier([DROITE, GAUCHE, recent], P, [], '2030-04-15');
    expect(new Set(controles.map((c) => c.dateReference))).toEqual(
      new Set(['2026-01-15', '2030-01-15']),
    );
  });

  it('classe par date prévue', () => {
    const autre = { dateDelivrance: '2026-02-20', oreille: 'GAUCHE' };
    const dates = controlesAPlanifier([DROITE, autre], P, [], '2026-06-01').map(
      (c) => c.datePrevue,
    );
    expect(dates).toEqual([...dates].sort());
  });

  it('sans délivrance, rien', () => {
    expect(controlesAPlanifier([], P, [], '2026-06-01')).toEqual([]);
  });
});

describe('créneau et saisies', () => {
  const UUID = '018f0000-0000-7000-8000-000000000001';

  it('la clef se relit', () => {
    const creneau = { date: '2026-11-02', heure: '09:30', praticienId: UUID, cabineId: null };
    const clef = clefCreneau(creneau);
    expect(lireCreneau(clef)).toEqual({ ...creneau, cabineId: '' });
  });

  it('un type sans praticien ni cabine donne une clef valide', () => {
    const creneau = { date: '2026-11-02', heure: '09:30', praticienId: null, cabineId: UUID };
    expect(clefCreneau(creneau)).toBe(`2026-11-02|09:30||${UUID}`);
  });

  it('une clef incomplète se lit à vide', () => {
    expect(lireCreneau('')).toEqual({ date: '', heure: '', praticienId: '', cabineId: '' });
  });

  it('valide la planification', () => {
    const saisie = {
      patientId: UUID,
      dateReference: '2026-01-15',
      rang: '1',
      centreId: UUID,
      typeRdvId: UUID,
      creneau: `2026-11-02|09:30|${UUID}|`,
    };
    expect(planificationControleSchema.parse(saisie)).toMatchObject({ rang: 1 });
    const mauvais = { ...saisie, creneau: 'x' };
    expect(planificationControleSchema.safeParse(mauvais).success).toBe(false);
  });

  it('exige un motif pour ignorer', () => {
    const saisie = { patientId: UUID, dateReference: '2026-01-15', rang: '1', motif: ' ' };
    expect(ignoranceControleSchema.safeParse(saisie).success).toBe(false);
  });
});
