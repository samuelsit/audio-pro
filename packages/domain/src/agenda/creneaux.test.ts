import { describe, expect, it } from 'vitest';

import { HORAIRES_VIDES, type HorairesOuverture } from '../centre/horaires';
import { localDepuisInstant } from '../commun/fuseau';
import {
  calculerCreneauxLibres,
  prochainCreneauLibre,
  type Creneau,
  type RechercheCreneaux,
} from './creneaux';
import type { ExceptionAgenda } from './disponibilites';

const LUNDI = '2027-01-11';
const t = (heure: string, date = LUNDI) => Date.parse(`${date}T${heure}:00+01:00`);

const SEMAINE: HorairesOuverture = {
  ...HORAIRES_VIDES,
  lundi: [{ debut: '09:00', fin: '10:00' }],
  mardi: [{ debut: '09:00', fin: '10:00' }],
};

const RECHERCHE: RechercheCreneaux = {
  centreId: 'c1',
  du: LUNDI,
  au: LUNDI,
  dureeMinutes: 30,
  requierePraticien: true,
  requiereCabine: false,
  praticiens: [{ id: 'p1', horaires: SEMAINE }],
  cabines: [],
  horairesCentre: SEMAINE,
  exceptions: [],
  occupations: [],
  pasAvant: 0,
  limite: 100,
};

const heures = (creneaux: readonly Creneau[]) =>
  creneaux.map(({ debut }) => localDepuisInstant(debut).heure);

describe('calculerCreneauxLibres', () => {
  it.each<{ cas: string; changements: Partial<RechercheCreneaux>; attendu: string[] }>([
    { cas: 'plage libre', changements: {}, attendu: ['09:00', '09:15', '09:30'] },
    { cas: 'durée égale à la plage', changements: { dureeMinutes: 60 }, attendu: ['09:00'] },
    { cas: 'plage trop courte', changements: { dureeMinutes: 90 }, attendu: [] },
    {
      cas: 'durée hors grille',
      changements: { dureeMinutes: 25 },
      attendu: ['09:00', '09:15', '09:30'],
    },
    {
      cas: 'RDV existant au milieu',
      changements: {
        occupations: [{ praticienId: 'p1', cabineId: null, debut: t('09:15'), fin: t('09:30') }],
      },
      attendu: ['09:30'],
    },
    {
      cas: 'RDV d’un autre praticien sans effet',
      changements: {
        occupations: [{ praticienId: 'p2', cabineId: null, debut: t('09:00'), fin: t('10:00') }],
      },
      attendu: ['09:00', '09:15', '09:30'],
    },
    {
      cas: 'pas avant cet instant',
      changements: { pasAvant: t('09:10') },
      attendu: ['09:15', '09:30'],
    },
    {
      cas: 'plage décalée : grille alignée sur le quart d’heure',
      changements: {
        praticiens: [
          { id: 'p1', horaires: { ...HORAIRES_VIDES, lundi: [{ debut: '09:10', fin: '10:00' }] } },
        ],
      },
      attendu: ['09:15', '09:30'],
    },
  ])('$cas', ({ changements, attendu }) => {
    expect(heures(calculerCreneauxLibres({ ...RECHERCHE, ...changements }))).toEqual(attendu);
  });

  it('applique une exception', () => {
    const exceptions: ExceptionAgenda[] = [
      {
        type: 'INDISPONIBILITE',
        praticienId: 'p1',
        cabineId: null,
        centreId: null,
        debut: t('09:00'),
        fin: t('09:30'),
      },
    ];
    expect(heures(calculerCreneauxLibres({ ...RECHERCHE, exceptions }))).toEqual(['09:30']);
  });

  it('propose chaque praticien disponible, à chaque heure', () => {
    const creneaux = calculerCreneauxLibres({
      ...RECHERCHE,
      dureeMinutes: 60,
      praticiens: [
        { id: 'p1', horaires: SEMAINE },
        { id: 'p2', horaires: SEMAINE },
      ],
    });
    expect(creneaux.map((c) => c.praticienId)).toEqual(['p1', 'p2']);
  });

  it('un praticien pris sur un autre centre n’est pas libre', () => {
    const occupations = [{ praticienId: 'p1', cabineId: null, debut: t('09:00'), fin: t('10:00') }];
    expect(calculerCreneauxLibres({ ...RECHERCHE, occupations })).toEqual([]);
  });

  describe('avec une cabine', () => {
    const avecCabines = { ...RECHERCHE, requiereCabine: true, cabines: ['k1', 'k2'] };

    it('choisit la première cabine libre', () => {
      const occupations = [
        { praticienId: null, cabineId: 'k1', debut: t('09:00'), fin: t('09:30') },
      ];
      const creneaux = calculerCreneauxLibres({ ...avecCabines, occupations });
      expect(creneaux.map((c) => [localDepuisInstant(c.debut).heure, c.cabineId])).toEqual([
        ['09:00', 'k2'],
        ['09:15', 'k2'],
        ['09:30', 'k1'],
      ]);
    });

    it('sans cabine libre, pas de créneau', () => {
      const occupations = ['k1', 'k2'].map((cabineId) => ({
        praticienId: null,
        cabineId,
        debut: t('09:00'),
        fin: t('10:00'),
      }));
      expect(calculerCreneauxLibres({ ...avecCabines, occupations })).toEqual([]);
    });

    it('croise praticien et ouverture du centre', () => {
      const horairesCentre = { ...HORAIRES_VIDES, lundi: [{ debut: '09:30', fin: '12:00' }] };
      expect(heures(calculerCreneauxLibres({ ...avecCabines, horairesCentre }))).toEqual(['09:30']);
    });

    it('un type sans praticien suit la cabine', () => {
      const creneaux = calculerCreneauxLibres({
        ...avecCabines,
        requierePraticien: false,
        praticiens: [],
        dureeMinutes: 60,
      });
      expect(creneaux).toEqual([
        { debut: t('09:00'), fin: t('10:00'), praticienId: null, cabineId: 'k1' },
      ]);
    });
  });

  it('parcourt plusieurs jours et s’arrête à la limite', () => {
    const recherche = { ...RECHERCHE, au: '2027-01-13', dureeMinutes: 60 };
    expect(calculerCreneauxLibres(recherche)).toHaveLength(2);
    expect(calculerCreneauxLibres({ ...recherche, limite: 1 })).toHaveLength(1);
  });

  describe('changement d’heure', () => {
    const dimanche: HorairesOuverture = {
      ...HORAIRES_VIDES,
      dimanche: [{ debut: '01:00', fin: '04:00' }],
    };
    const nuit = {
      ...RECHERCHE,
      praticiens: [{ id: 'p1', horaires: dimanche }],
      dureeMinutes: 60,
      limite: 100,
    };

    it('printemps : aucune heure entre 2 h et 3 h, la plage de 1 h à 4 h dure 2 h', () => {
      const creneaux = calculerCreneauxLibres({ ...nuit, du: '2027-03-28', au: '2027-03-28' });
      expect(heures(creneaux)).toEqual(['01:00', '01:15', '01:30', '01:45', '03:00']);
      expect(creneaux[0]?.fin).toBe(Date.parse('2027-03-28T01:00:00Z'));
    });

    it('printemps : un créneau à cheval dure son temps réel', () => {
      const creneaux = calculerCreneauxLibres({
        ...nuit,
        du: '2027-03-28',
        au: '2027-03-28',
        dureeMinutes: 90,
      });
      expect(heures(creneaux)).toEqual(['01:00', '01:15', '01:30']);
      expect(creneaux[0]?.fin).toBe(Date.parse('2027-03-28T01:30:00Z'));
    });

    it('automne : l’heure doublée est proposée deux fois, la plage de 1 h à 4 h dure 4 h', () => {
      const creneaux = calculerCreneauxLibres({ ...nuit, du: '2027-10-31', au: '2027-10-31' });
      expect(creneaux).toHaveLength(13);
      expect(heures(creneaux).filter((h) => h === '02:00')).toHaveLength(2);
      expect(creneaux.at(-1)?.fin).toBe(Date.parse('2027-10-31T03:00:00Z'));
    });

    it('les créneaux gardent l’heure locale de part et d’autre du changement', () => {
      const lundiSamedi: HorairesOuverture = {
        ...HORAIRES_VIDES,
        samedi: [{ debut: '09:00', fin: '09:30' }],
        lundi: [{ debut: '09:00', fin: '09:30' }],
      };
      const creneaux = calculerCreneauxLibres({
        ...RECHERCHE,
        du: '2027-03-27',
        au: '2027-03-29',
        praticiens: [{ id: 'p1', horaires: lundiSamedi }],
      });
      expect(heures(creneaux)).toEqual(['09:00', '09:00']);
      expect(creneaux[0]?.debut).toBe(Date.parse('2027-03-27T08:00:00Z'));
      expect(creneaux[1]?.debut).toBe(Date.parse('2027-03-29T07:00:00Z'));
    });
  });
});

describe('prochainCreneauLibre', () => {
  it('renvoie le premier créneau de la période', () => {
    const recherche = { ...RECHERCHE, du: LUNDI, au: '2027-01-12', dureeMinutes: 60 };
    const occupations = [{ praticienId: 'p1', cabineId: null, debut: t('09:00'), fin: t('10:00') }];
    expect(prochainCreneauLibre({ ...recherche, occupations })?.debut).toBe(
      t('09:00', '2027-01-12'),
    );
  });

  it('renvoie null sans créneau', () => {
    expect(prochainCreneauLibre({ ...RECHERCHE, dureeMinutes: 120 })).toBeNull();
  });
});
