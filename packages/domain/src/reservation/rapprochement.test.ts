import { describe, expect, it } from 'vitest';

import { rapprocherPatient, type FichePatientCandidate } from './rapprochement';

const FICHE: FichePatientCandidate = {
  id: 'p1',
  nomNaissance: 'Lefèvre',
  nomUsage: 'Martin',
  prenoms: 'Anne Marie',
  dateNaissance: '1950-03-02',
  telephone: '06 12 34 56 78',
};
const IDENTITE = {
  nom: 'LEFEVRE',
  prenom: 'anne',
  dateNaissance: '1950-03-02',
  telephone: '+33612345678',
};

describe('rapprocherPatient', () => {
  it.each([
    { cas: 'nom de naissance', fiches: [FICHE], identite: {}, attendu: 'p1' },
    { cas: 'nom d’usage', fiches: [FICHE], identite: { nom: 'martin' }, attendu: 'p1' },
    {
      cas: 'autre prénom, une seule fiche',
      fiches: [FICHE],
      identite: { prenom: 'A.' },
      attendu: 'p1',
    },
    {
      cas: 'téléphone stocké en +33',
      fiches: [{ ...FICHE, telephone: '+33612345678' }],
      identite: {},
      attendu: 'p1',
    },
    {
      cas: 'sans nom d’usage',
      fiches: [{ ...FICHE, nomUsage: null }],
      identite: {},
      attendu: 'p1',
    },
    {
      cas: 'autre téléphone',
      fiches: [FICHE],
      identite: { telephone: '+33700000000' },
      attendu: null,
    },
    { cas: 'autre nom', fiches: [FICHE], identite: { nom: 'Durand' }, attendu: null },
    {
      cas: 'autre nom, sans nom d’usage',
      fiches: [{ ...FICHE, nomUsage: null }],
      identite: { nom: 'Martin' },
      attendu: null,
    },
    {
      cas: 'autre date de naissance',
      fiches: [FICHE],
      identite: { dateNaissance: '1950-03-03' },
      attendu: null,
    },
    {
      cas: 'fiche sans téléphone',
      fiches: [{ ...FICHE, telephone: null }],
      identite: {},
      attendu: null,
    },
    { cas: 'aucune fiche', fiches: [], identite: {}, attendu: null },
  ])('$cas', ({ fiches, identite, attendu }) => {
    expect(rapprocherPatient(fiches, { ...IDENTITE, ...identite })).toBe(attendu);
  });

  const jumelle = { ...FICHE, id: 'p2', prenoms: 'Louise' };

  it.each([
    { cas: 'premier prénom', prenom: 'Anne', attendu: 'p1' },
    { cas: 'prénoms complets', prenom: 'Anne Marie', attendu: 'p1' },
    { cas: 'la jumelle', prenom: 'louise', attendu: 'p2' },
    { cas: 'prénom inconnu : prospect', prenom: 'Jeanne', attendu: null },
    { cas: 'début de prénom seulement', prenom: 'Lou', attendu: null },
  ])('jumeaux au même numéro : $cas', ({ prenom, attendu }) => {
    expect(rapprocherPatient([FICHE, jumelle], { ...IDENTITE, prenom })).toBe(attendu);
  });

  it('deux fiches indiscernables restent un prospect', () => {
    expect(rapprocherPatient([FICHE, { ...FICHE, id: 'p2' }], IDENTITE)).toBeNull();
  });
});
