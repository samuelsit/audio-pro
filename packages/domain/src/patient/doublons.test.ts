import { describe, expect, it } from 'vitest';

import { motifsDoublon, type IdentiteComparable } from './doublons';

const assure: IdentiteComparable = {
  nomNaissance: 'Lefèvre',
  nomUsage: null,
  dateNaissance: '1950-03-05',
  nirEmpreinte: 'e1',
  qualite: 'ASSURE',
  rangNaissance: 1,
};

const enfant: IdentiteComparable = {
  nomNaissance: 'Martin',
  nomUsage: null,
  dateNaissance: '2015-06-01',
  nirEmpreinte: 'e1',
  qualite: 'AYANT_DROIT',
  rangNaissance: 1,
};

const sansNir = { nirEmpreinte: null, qualite: null, rangNaissance: null } as const;

describe('motifsDoublon', () => {
  it.each([
    {
      cas: 'même assuré : même NIR et même identité',
      candidat: assure,
      existant: { ...assure },
      attendu: ['MEME_NIR', 'MEME_IDENTITE'],
    },
    {
      cas: 'deux assurés de même NIR (erreur de saisie du nom et de la date)',
      candidat: assure,
      existant: { ...assure, nomNaissance: 'Lefevbre', dateNaissance: '1950-05-03' },
      attendu: ['MEME_NIR'],
    },
    {
      cas: 'assuré et ayant droit de même NIR : deux personnes',
      candidat: assure,
      existant: enfant,
      attendu: [],
    },
    {
      cas: 'ayant droit et assuré de même NIR : deux personnes',
      candidat: enfant,
      existant: assure,
      attendu: [],
    },
    {
      cas: 'même ayant droit (même date, même rang)',
      candidat: enfant,
      existant: { ...enfant, nomNaissance: 'Autre' },
      attendu: ['MEME_NIR'],
    },
    {
      cas: 'deux ayants droit de même NIR nés à des dates différentes',
      candidat: enfant,
      existant: { ...enfant, nomNaissance: 'Autre', dateNaissance: '2017-01-01' },
      attendu: [],
    },
    {
      cas: 'jumeaux : même NIR, même date, rangs différents, même nom',
      candidat: enfant,
      existant: { ...enfant, rangNaissance: 2 },
      attendu: ['MEME_IDENTITE'],
    },
    {
      cas: 'même nom sans accent ni casse, même date, sans NIR',
      candidat: { ...assure, ...sansNir },
      existant: { ...assure, ...sansNir, nomNaissance: 'LEFEVRE' },
      attendu: ['MEME_IDENTITE'],
    },
    {
      cas: 'nom d’usage de l’existant = nom de naissance du candidat',
      candidat: assure,
      existant: { ...assure, nomNaissance: 'Martin', nomUsage: 'lefevre', nirEmpreinte: 'e2' },
      attendu: ['MEME_IDENTITE'],
    },
    {
      cas: 'nom d’usage du candidat = nom de naissance de l’existant',
      candidat: { ...assure, ...sansNir, nomNaissance: 'Martin', nomUsage: 'Lefèvre' },
      existant: { ...assure, ...sansNir },
      attendu: ['MEME_IDENTITE'],
    },
    {
      cas: 'même nom, autre date, autre NIR',
      candidat: assure,
      existant: { ...assure, dateNaissance: '1950-03-06', nirEmpreinte: 'e2' },
      attendu: [],
    },
    {
      cas: 'même date, autre nom, autre NIR',
      candidat: assure,
      existant: { ...assure, nomNaissance: 'Martin', nirEmpreinte: 'e2' },
      attendu: [],
    },
    {
      cas: 'nom d’usage vide ignoré',
      candidat: assure,
      existant: { ...assure, nomNaissance: 'Martin', nomUsage: '  ', nirEmpreinte: 'e2' },
      attendu: [],
    },
    {
      cas: 'deux fiches sans NIR : pas de doublon par le NIR',
      candidat: { ...assure, ...sansNir },
      existant: { ...assure, ...sansNir, nomNaissance: 'Martin' },
      attendu: [],
    },
  ])('$cas', ({ candidat, existant, attendu }) => {
    expect(motifsDoublon(candidat, existant)).toEqual(attendu);
  });
});
