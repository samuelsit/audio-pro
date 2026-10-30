import { describe, expect, it } from 'vitest';

import { prescriptionValide } from './prescription';

const ORL = { specialite: 'ORL', formationOtologie: null } as const;
const GENERALISTE_FORME = { specialite: 'MEDECIN_GENERALISTE', formationOtologie: true } as const;
const GENERALISTE_NON_FORME = {
  specialite: 'MEDECIN_GENERALISTE',
  formationOtologie: false,
} as const;
const GENERALISTE_INCONNU = { specialite: 'MEDECIN_GENERALISTE', formationOtologie: null } as const;
const AUTRE = { specialite: 'AUTRE', formationOtologie: null } as const;

const DATES = { datePrescription: '2026-10-01', dateDevis: '2026-10-30' };

describe('prescriptionValide : qualité du prescripteur (À VÉRIFIER, avertissements)', () => {
  it.each([
    { cas: 'primo, 7 ans, ORL', prescripteur: ORL, age: 7, type: 'PREMIER_APPAREILLAGE', a: [] },
    {
      cas: 'primo, 72 ans, généraliste formé',
      prescripteur: GENERALISTE_FORME,
      age: 72,
      type: 'PREMIER_APPAREILLAGE',
      a: [],
    },
    {
      cas: 'primo, 72 ans, généraliste non formé',
      prescripteur: GENERALISTE_NON_FORME,
      age: 72,
      type: 'PREMIER_APPAREILLAGE',
      a: ['PRESCRIPTEUR_NON_CONFORME'],
    },
    {
      cas: 'primo, 72 ans, formation inconnue',
      prescripteur: GENERALISTE_INCONNU,
      age: 72,
      type: 'PREMIER_APPAREILLAGE',
      a: ['FORMATION_OTOLOGIE_INCONNUE'],
    },
    {
      cas: 'primo, 72 ans, autre spécialité',
      prescripteur: AUTRE,
      age: 72,
      type: 'PREMIER_APPAREILLAGE',
      a: ['PRESCRIPTEUR_NON_CONFORME'],
    },
    { cas: 'primo, 6 ans, ORL', prescripteur: ORL, age: 6, type: 'PREMIER_APPAREILLAGE', a: [] },
    {
      cas: 'primo, 6 ans, généraliste formé',
      prescripteur: GENERALISTE_FORME,
      age: 6,
      type: 'PREMIER_APPAREILLAGE',
      a: ['PRESCRIPTEUR_NON_CONFORME'],
    },
    {
      cas: 'renouvellement, 72 ans, généraliste non formé',
      prescripteur: GENERALISTE_NON_FORME,
      age: 72,
      type: 'RENOUVELLEMENT',
      a: [],
    },
    {
      cas: 'renouvellement, 72 ans, autre spécialité',
      prescripteur: AUTRE,
      age: 72,
      type: 'RENOUVELLEMENT',
      a: ['SPECIALITE_A_CONTROLER'],
    },
    { cas: 'renouvellement, 6 ans, ORL', prescripteur: ORL, age: 6, type: 'RENOUVELLEMENT', a: [] },
    {
      cas: 'renouvellement, 6 ans, généraliste',
      prescripteur: GENERALISTE_FORME,
      age: 6,
      type: 'RENOUVELLEMENT',
      a: ['PRESCRIPTEUR_NON_CONFORME'],
    },
  ] as const)('$cas', ({ prescripteur, age, type, a }) => {
    expect(prescriptionValide({ prescripteur, age, type, ...DATES })).toEqual({
      valide: true,
      erreurs: [],
      avertissements: a,
    });
  });
});

describe('prescriptionValide : antériorité au devis', () => {
  it.each([
    { cas: 'la veille', datePrescription: '2026-10-29', valide: true },
    { cas: 'le jour du devis', datePrescription: '2026-10-30', valide: true },
    { cas: 'le lendemain', datePrescription: '2026-10-31', valide: false },
  ])('$cas', ({ datePrescription, valide }) => {
    const resultat = prescriptionValide({
      prescripteur: ORL,
      age: 72,
      type: 'PREMIER_APPAREILLAGE',
      datePrescription,
      dateDevis: '2026-10-30',
    });
    expect(resultat.valide).toBe(valide);
    expect(resultat.erreurs).toEqual(valide ? [] : ['PRESCRIPTION_POSTERIEURE_AU_DEVIS']);
  });
});
