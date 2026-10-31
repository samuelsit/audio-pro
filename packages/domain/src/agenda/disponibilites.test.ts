import { describe, expect, it } from 'vitest';

import { HORAIRES_VIDES, type HorairesOuverture } from '../centre/horaires';
import {
  jourDeChevauchement,
  plagesCabine,
  plagesDuJour,
  plagesPraticien,
  type ExceptionAgenda,
} from './disponibilites';

// 2027-01-11 est un lundi d'hiver (UTC+1).
const LUNDI = '2027-01-11';
const t = (heure: string) => Date.parse(`${LUNDI}T${heure}:00+01:00`);
const plage = (debut: string, fin: string) => ({ debut: t(debut), fin: t(fin) });

const HORAIRES: HorairesOuverture = {
  ...HORAIRES_VIDES,
  lundi: [
    { debut: '09:00', fin: '12:00' },
    { debut: '14:00', fin: '18:00' },
  ],
};

function exception(partiel: Partial<ExceptionAgenda> & { type: ExceptionAgenda['type'] }) {
  return {
    praticienId: null,
    cabineId: null,
    centreId: null,
    debut: t('00:00'),
    fin: t('23:59'),
    ...partiel,
  };
}

const base = { date: LUNDI, centreId: 'c1', praticienId: 'p1', horaires: HORAIRES };

describe('plagesDuJour', () => {
  it('lit le bon jour de la semaine', () => {
    expect(plagesDuJour(HORAIRES, LUNDI)).toEqual([
      plage('09:00', '12:00'),
      plage('14:00', '18:00'),
    ]);
    expect(plagesDuJour(HORAIRES, '2027-01-12')).toEqual([]);
  });

  it('suit l’heure locale des deux côtés du changement d’heure', () => {
    const horaires = {
      ...HORAIRES_VIDES,
      samedi: [{ debut: '09:00', fin: '10:00' }],
      lundi: [{ debut: '09:00', fin: '10:00' }],
    };
    const [samedi] = plagesDuJour(horaires, '2027-03-27');
    const [lundi] = plagesDuJour(horaires, '2027-03-29');
    expect(samedi?.debut).toBe(Date.parse('2027-03-27T08:00:00Z'));
    expect(lundi?.debut).toBe(Date.parse('2027-03-29T07:00:00Z'));
  });

  it('une plage à cheval sur le changement d’heure dure son temps réel', () => {
    const horaires = { ...HORAIRES_VIDES, dimanche: [{ debut: '01:00', fin: '04:00' }] };
    const [printemps] = plagesDuJour(horaires, '2027-03-28');
    const [automne] = plagesDuJour(horaires, '2027-10-31');
    expect(printemps && (printemps.fin - printemps.debut) / 3_600_000).toBe(2);
    expect(automne && (automne.fin - automne.debut) / 3_600_000).toBe(4);
  });
});

describe('plagesPraticien', () => {
  it.each([
    {
      cas: 'sans exception',
      exceptions: [],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'congé, valable sur tous les centres',
      exceptions: [exception({ type: 'CONGE', praticienId: 'p1' })],
      attendu: [],
    },
    {
      cas: 'congé d’un autre praticien',
      exceptions: [exception({ type: 'CONGE', praticienId: 'p2' })],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'indisponibilité partielle, tous centres',
      exceptions: [
        exception({
          type: 'INDISPONIBILITE',
          praticienId: 'p1',
          debut: t('10:00'),
          fin: t('11:00'),
        }),
      ],
      attendu: [plage('09:00', '10:00'), plage('11:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'indisponibilité sur ce centre',
      exceptions: [exception({ type: 'INDISPONIBILITE', praticienId: 'p1', centreId: 'c1' })],
      attendu: [],
    },
    {
      cas: 'indisponibilité sur un autre centre',
      exceptions: [exception({ type: 'INDISPONIBILITE', praticienId: 'p1', centreId: 'c2' })],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'fermeture de ce centre, plus forte qu’une disponibilité',
      exceptions: [
        exception({ type: 'FERMETURE_CENTRE', centreId: 'c1', debut: t('12:00'), fin: t('15:00') }),
        exception({
          type: 'DISPONIBILITE',
          praticienId: 'p1',
          centreId: 'c1',
          debut: t('12:00'),
          fin: t('14:00'),
        }),
      ],
      attendu: [plage('09:00', '12:00'), plage('15:00', '18:00')],
    },
    {
      cas: 'fermeture d’un autre centre',
      exceptions: [exception({ type: 'FERMETURE_CENTRE', centreId: 'c2' })],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'disponibilité exceptionnelle qui prolonge une plage',
      exceptions: [
        exception({
          type: 'DISPONIBILITE',
          praticienId: 'p1',
          centreId: 'c1',
          debut: t('12:00'),
          fin: t('13:00'),
        }),
      ],
      attendu: [plage('09:00', '13:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'disponibilité sur un autre centre ou d’un autre praticien',
      exceptions: [
        exception({
          type: 'DISPONIBILITE',
          praticienId: 'p1',
          centreId: 'c2',
          debut: t('12:00'),
          fin: t('13:00'),
        }),
        exception({
          type: 'DISPONIBILITE',
          praticienId: 'p2',
          centreId: 'c1',
          debut: t('12:00'),
          fin: t('13:00'),
        }),
      ],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
  ])('$cas', ({ exceptions, attendu }) => {
    expect(plagesPraticien({ ...base, exceptions })).toEqual(attendu);
  });

  it('une disponibilité de plusieurs jours est coupée à la journée', () => {
    const exceptions = [
      exception({
        type: 'DISPONIBILITE',
        praticienId: 'p1',
        centreId: 'c1',
        debut: Date.parse('2027-01-12T10:00:00+01:00'),
        fin: Date.parse('2027-01-14T10:00:00+01:00'),
      }),
    ];
    expect(plagesPraticien({ ...base, date: '2027-01-13', exceptions })).toEqual([
      {
        debut: Date.parse('2027-01-13T00:00:00+01:00'),
        fin: Date.parse('2027-01-14T00:00:00+01:00'),
      },
    ]);
  });
});

describe('plagesCabine', () => {
  const cabine = { date: LUNDI, centreId: 'c1', cabineId: 'k1', horairesCentre: HORAIRES };

  it.each([
    {
      cas: 'ouverture du centre',
      exceptions: [],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'cabine indisponible',
      exceptions: [
        exception({ type: 'INDISPONIBILITE', cabineId: 'k1', debut: t('09:00'), fin: t('12:00') }),
      ],
      attendu: [plage('14:00', '18:00')],
    },
    {
      cas: 'autre cabine indisponible',
      exceptions: [exception({ type: 'INDISPONIBILITE', cabineId: 'k2' })],
      attendu: [plage('09:00', '12:00'), plage('14:00', '18:00')],
    },
    {
      cas: 'fermeture du centre',
      exceptions: [exception({ type: 'FERMETURE_CENTRE', centreId: 'c1' })],
      attendu: [],
    },
    {
      cas: 'une disponibilité exceptionnelle du centre ouvre la cabine',
      exceptions: [
        exception({
          type: 'DISPONIBILITE',
          praticienId: 'p1',
          centreId: 'c1',
          debut: t('18:00'),
          fin: t('19:00'),
        }),
      ],
      attendu: [plage('09:00', '12:00'), plage('14:00', '19:00')],
    },
  ])('$cas', ({ exceptions, attendu }) => {
    expect(plagesCabine({ ...cabine, exceptions })).toEqual(attendu);
  });
});

describe('jourDeChevauchement', () => {
  const matin = { ...HORAIRES_VIDES, lundi: [{ debut: '09:00', fin: '12:00' }] };

  it.each([
    { cas: 'même plage', b: matin, attendu: 'lundi' },
    {
      cas: 'bout à bout',
      b: { ...HORAIRES_VIDES, lundi: [{ debut: '12:00', fin: '13:00' }] },
      attendu: null,
    },
    {
      cas: 'autre jour',
      b: { ...HORAIRES_VIDES, mardi: [{ debut: '09:00', fin: '12:00' }] },
      attendu: null,
    },
    {
      cas: 'recouvrement',
      b: { ...HORAIRES_VIDES, lundi: [{ debut: '11:00', fin: '13:00' }] },
      attendu: 'lundi',
    },
  ])('$cas', ({ b, attendu }) => {
    expect(jourDeChevauchement(matin, b)).toBe(attendu);
  });
});
