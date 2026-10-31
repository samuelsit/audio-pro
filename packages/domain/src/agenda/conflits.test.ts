import { describe, expect, it } from 'vitest';

import { HORAIRES_VIDES, type HorairesOuverture } from '../centre/horaires';
import { CODES_CONFLIT, detecterConflits, estBloquant, type Candidat } from './conflits';
import type { ExceptionAgenda } from './disponibilites';

const LUNDI = '2027-01-11';
const t = (heure: string) => Date.parse(`${LUNDI}T${heure}:00+01:00`);

const HORAIRES: HorairesOuverture = {
  ...HORAIRES_VIDES,
  lundi: [{ debut: '09:00', fin: '12:00' }],
};

const CANDIDAT: Candidat = {
  centreId: 'c1',
  praticienId: 'p1',
  cabineId: 'k1',
  debut: t('10:00'),
  fin: t('10:30'),
};

const CONTEXTE = {
  occupations: [],
  horairesPraticien: HORAIRES,
  horairesCentre: HORAIRES,
  exceptions: [],
};

const fermeture: ExceptionAgenda = {
  type: 'FERMETURE_CENTRE',
  praticienId: null,
  cabineId: null,
  centreId: 'c1',
  debut: t('00:00'),
  fin: t('23:00'),
};

describe('detecterConflits', () => {
  it.each([
    { cas: 'créneau libre', candidat: {}, contexte: {}, attendu: [] },
    {
      cas: 'praticien pris',
      candidat: {},
      contexte: {
        occupations: [{ praticienId: 'p1', cabineId: 'k2', debut: t('10:15'), fin: t('10:45') }],
      },
      attendu: ['PRATICIEN_PRIS'],
    },
    {
      cas: 'cabine prise',
      candidat: {},
      contexte: {
        occupations: [{ praticienId: 'p2', cabineId: 'k1', debut: t('09:45'), fin: t('10:15') }],
      },
      attendu: ['CABINE_PRISE'],
    },
    {
      cas: 'bout à bout',
      candidat: {},
      contexte: {
        occupations: [{ praticienId: 'p1', cabineId: 'k1', debut: t('10:30'), fin: t('11:00') }],
      },
      attendu: [],
    },
    {
      cas: 'les deux pris, hors horaires',
      candidat: { debut: t('13:00'), fin: t('13:30') },
      contexte: {
        occupations: [{ praticienId: 'p1', cabineId: 'k1', debut: t('13:00'), fin: t('14:00') }],
      },
      attendu: ['PRATICIEN_PRIS', 'CABINE_PRISE', 'HORS_DISPONIBILITES'],
    },
    {
      cas: 'praticien tenu par un verrou en ligne',
      candidat: {},
      contexte: {
        occupations: [
          { praticienId: 'p1', cabineId: 'k2', debut: t('10:00'), fin: t('10:30'), verrou: true },
        ],
      },
      attendu: ['VERROU_EN_LIGNE'],
    },
    {
      cas: 'cabine tenue par un verrou en ligne',
      candidat: {},
      contexte: {
        occupations: [
          { praticienId: 'p2', cabineId: 'k1', debut: t('10:00'), fin: t('10:30'), verrou: true },
        ],
      },
      attendu: ['VERROU_EN_LIGNE'],
    },
    {
      cas: 'verrou sur d’autres ressources',
      candidat: {},
      contexte: {
        occupations: [
          { praticienId: 'p2', cabineId: 'k2', debut: t('10:00'), fin: t('10:30'), verrou: true },
        ],
      },
      attendu: [],
    },
    {
      cas: 'verrou sans ressource du candidat',
      candidat: { praticienId: null, cabineId: null },
      contexte: {
        occupations: [
          { praticienId: null, cabineId: null, debut: t('10:00'), fin: t('10:30'), verrou: true },
        ],
      },
      attendu: [],
    },
    {
      cas: 'rendez-vous et verrou sur le même créneau',
      candidat: {},
      contexte: {
        occupations: [
          { praticienId: 'p1', cabineId: 'k2', debut: t('10:00'), fin: t('10:30') },
          { praticienId: 'p2', cabineId: 'k1', debut: t('10:00'), fin: t('10:30'), verrou: true },
        ],
      },
      attendu: ['PRATICIEN_PRIS', 'VERROU_EN_LIGNE'],
    },
    {
      cas: 'praticien absent de ce centre',
      candidat: {},
      contexte: { horairesPraticien: null },
      attendu: ['HORS_DISPONIBILITES'],
    },
    {
      cas: 'déborde des horaires',
      candidat: { debut: t('11:45'), fin: t('12:15') },
      contexte: {},
      attendu: ['HORS_DISPONIBILITES'],
    },
    {
      cas: 'cabine hors ouverture, sans praticien',
      candidat: { praticienId: null, debut: t('13:00'), fin: t('13:30') },
      contexte: {},
      attendu: ['HORS_DISPONIBILITES'],
    },
    {
      cas: 'praticien sans cabine, hors ouverture du centre',
      candidat: { cabineId: null },
      contexte: { horairesCentre: HORAIRES_VIDES },
      attendu: [],
    },
    {
      cas: 'fermeture du centre',
      candidat: {},
      contexte: { exceptions: [fermeture] },
      attendu: ['CENTRE_FERME'],
    },
    {
      cas: 'fermeture d’un autre centre',
      candidat: {},
      contexte: { exceptions: [{ ...fermeture, centreId: 'c2' }] },
      attendu: [],
    },
    {
      cas: 'une indisponibilité ne ferme pas le centre',
      candidat: {},
      contexte: {
        exceptions: [{ ...fermeture, type: 'INDISPONIBILITE', praticienId: 'p1', centreId: null }],
      },
      attendu: ['HORS_DISPONIBILITES'],
    },
  ] as const)('$cas', ({ candidat, contexte, attendu }) => {
    expect(detecterConflits({ ...CANDIDAT, ...candidat }, { ...CONTEXTE, ...contexte })).toEqual(
      attendu,
    );
  });
});

describe('estBloquant', () => {
  it('seule une ressource prise bloque', () => {
    expect(CODES_CONFLIT.filter(estBloquant)).toEqual(['PRATICIEN_PRIS', 'CABINE_PRISE']);
  });
});
