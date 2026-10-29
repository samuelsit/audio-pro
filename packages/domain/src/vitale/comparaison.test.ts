import { describe, expect, it } from 'vitest';

import { nirSchema } from '../patient/nir';
import type { AmcSaisie, AmoSaisie, PatientSaisie } from '../patient/patient';
import { beneficiaireVitaleSchema, type BeneficiaireVitale } from '../ports/vitale-reader';
import {
  amoDepuisCarte,
  appliquerCarte,
  CHAMPS_CARTE,
  comparerAvecCarte,
  LIBELLES_CHAMPS_CARTE,
  origineApresLecture,
  valeurCarte,
  valeurFiche,
  type ChampCarte,
} from './comparaison';

// NIR fictifs (clés valides) ; voir patient/nir.test.ts.
const NIR = '269014999912339';
const AUTRE_NIR = '185052A99912382';

const amcCarte: AmcSaisie = {
  organismeNom: 'Mutuelle Démo',
  organismeIdentifiant: '99999991',
  numeroAdherent: 'A1',
  typeContrat: null,
  debutValidite: '2026-01-01',
  finValidite: '2026-12-31',
};

const carte: BeneficiaireVitale = beneficiaireVitaleSchema.parse({
  nom: 'LEFEVRE',
  prenom: 'JEANNE',
  dateNaissance: '1950-03-05',
  rang: 1,
  nir: NIR,
  qualite: 'ASSURE',
  regime: '01',
  caisse: '999',
  centreGestionnaire: '9999',
  droitsAmo: { debut: '2026-01-01', fin: '2026-12-31' },
  c2s: false,
  ald: true,
  amc: amcCarte,
});

const amoFiche: AmoSaisie = amoDepuisCarte(carte);

/** Fiche identique à la carte (accents et casse près). */
const fiche: PatientSaisie = {
  centreId: 'centre-a',
  civilite: 'MME',
  nomNaissance: 'Lefèvre',
  nomUsage: null,
  prenoms: 'Jeanne Marie',
  dateNaissance: '1950-03-05',
  sexe: 'FEMININ',
  adresseLigne1: null,
  adresseLigne2: null,
  codePostal: null,
  ville: null,
  telephone: null,
  email: null,
  medecinTraitant: null,
  consentementSms: false,
  consentementEmail: false,
  consentementCourrier: false,
  notes: null,
  amo: amoFiche,
  amc: amcCarte,
};

describe('amoDepuisCarte', () => {
  it('reprend la couverture lue, fin de droits comprise', () => {
    expect(amoFiche).toEqual({
      nir: NIR,
      rangNaissance: 1,
      qualite: 'ASSURE',
      regime: '01',
      caisse: '999',
      centreGestionnaire: '9999',
      finDroits: '2026-12-31',
      c2s: false,
      ald: true,
    });
  });
});

describe('comparerAvecCarte', () => {
  it.each<{ cas: string; fiche: PatientSaisie; carte?: BeneficiaireVitale; attendu: ChampCarte[] }>(
    [
      { cas: 'fiche identique (accents, casse, premier prénom)', fiche, attendu: [] },
      {
        cas: 'nom de naissance différent',
        fiche: { ...fiche, nomNaissance: 'Lefebvre' },
        attendu: ['nom'],
      },
      {
        cas: 'nom d’usage comparé en priorité',
        fiche: { ...fiche, nomUsage: 'Martin' },
        attendu: ['nom'],
      },
      {
        cas: 'nom d’usage égal au nom de la carte',
        fiche: { ...fiche, nomNaissance: 'Dupont', nomUsage: 'Lefèvre' },
        attendu: [],
      },
      { cas: 'autre prénom', fiche: { ...fiche, prenoms: 'Marie Jeanne' }, attendu: ['prenoms'] },
      { cas: 'prénom seul identique', fiche: { ...fiche, prenoms: 'jeanne' }, attendu: [] },
      {
        cas: 'date de naissance différente',
        fiche: { ...fiche, dateNaissance: '1950-03-06' },
        attendu: ['dateNaissance'],
      },
      { cas: 'fiche sans AMO : bloc entier', fiche: { ...fiche, amo: null }, attendu: ['amo'] },
      {
        cas: 'champs AMO un par un',
        fiche: {
          ...fiche,
          amo: {
            ...amoFiche,
            nir: nirSchema.parse(AUTRE_NIR),
            caisse: '751',
            finDroits: null,
            c2s: true,
          },
        },
        attendu: ['nir', 'caisse', 'finDroits', 'c2s'],
      },
      {
        cas: 'qualité, rang, régime, centre, ALD',
        fiche: {
          ...fiche,
          amo: {
            ...amoFiche,
            qualite: 'AYANT_DROIT',
            rangNaissance: 2,
            regime: null,
            centreGestionnaire: '1111',
            ald: false,
          },
        },
        attendu: ['qualite', 'rangNaissance', 'regime', 'centreGestionnaire', 'ald'],
      },
      { cas: 'fiche sans AMC', fiche: { ...fiche, amc: null }, attendu: ['amc'] },
      {
        cas: 'AMC différente',
        fiche: { ...fiche, amc: { ...amcCarte, numeroAdherent: 'B2' } },
        attendu: ['amc'],
      },
      {
        cas: 'carte sans AMC : rien n’est proposé',
        fiche: { ...fiche, amc: { ...amcCarte, numeroAdherent: 'B2' } },
        carte: { ...carte, amc: null },
        attendu: [],
      },
    ],
  )('$cas', ({ fiche: f, carte: c = carte, attendu }) => {
    expect(comparerAvecCarte(f, c)).toEqual(attendu);
  });
});

describe('appliquerCarte', () => {
  const differente: PatientSaisie = {
    ...fiche,
    nomNaissance: 'Lefebvre',
    prenoms: 'Marie',
    dateNaissance: '1950-03-06',
    amo: { ...amoFiche, caisse: '751', c2s: true },
    amc: null,
  };

  it('applique les seuls champs acceptés', () => {
    expect(appliquerCarte(differente, carte, ['nom', 'caisse', 'amc'])).toEqual({
      ...differente,
      nomNaissance: 'LEFEVRE',
      amo: { ...amoFiche, c2s: true },
      amc: amcCarte,
    });
  });

  it('tout accepter rend la fiche conforme à la carte', () => {
    const apres = appliquerCarte(differente, carte, CHAMPS_CARTE);
    expect(comparerAvecCarte(apres, carte)).toEqual([]);
    expect(apres).toMatchObject({ prenoms: 'JEANNE', dateNaissance: '1950-03-05', amo: amoFiche });
  });

  it('tout refuser ne change rien', () => {
    expect(appliquerCarte(differente, carte, [])).toEqual(differente);
  });

  it('met à jour le nom d’usage quand il est renseigné', () => {
    const avecUsage = { ...fiche, nomNaissance: 'Dupont', nomUsage: 'Martin' };
    expect(appliquerCarte(avecUsage, carte, ['nom'])).toMatchObject({
      nomNaissance: 'Dupont',
      nomUsage: 'LEFEVRE',
    });
  });

  it('crée la couverture AMO d’un bloc sur une fiche qui n’en a pas', () => {
    const sansAmo = { ...fiche, amo: null };
    expect(appliquerCarte(sansAmo, carte, ['amo']).amo).toEqual(amoFiche);
  });

  it('ignore un champ accepté qui ne s’applique pas', () => {
    const sansAmo = { ...fiche, amo: null };
    expect(appliquerCarte(sansAmo, carte, ['nir', 'caisse'])).toEqual(sansAmo);
    expect(appliquerCarte(fiche, carte, ['amo', 'nom'])).toEqual(fiche);
  });
});

describe('origineApresLecture', () => {
  it.each<{ cas: string; amo: AmoSaisie | null; origine: 'VITALE' | 'SAISIE' }>([
    { cas: 'couverture identique à la carte', amo: amoFiche, origine: 'VITALE' },
    {
      cas: 'mise à jour refusée en partie',
      amo: { ...amoFiche, caisse: '751' },
      origine: 'SAISIE',
    },
    { cas: 'sans couverture', amo: null, origine: 'SAISIE' },
  ])('$cas → $origine', ({ amo, origine }) => {
    expect(origineApresLecture(amo, carte)).toBe(origine);
  });
});

describe('valeurFiche et valeurCarte', () => {
  it.each<{ champ: ChampCarte; fiche: unknown; carte: unknown }>([
    { champ: 'nom', fiche: 'Lefèvre', carte: 'LEFEVRE' },
    { champ: 'prenoms', fiche: 'Jeanne Marie', carte: 'JEANNE' },
    { champ: 'dateNaissance', fiche: '1950-03-05', carte: '1950-03-05' },
    { champ: 'amo', fiche: amoFiche, carte: amoFiche },
    { champ: 'nir', fiche: NIR, carte: NIR },
    { champ: 'rangNaissance', fiche: 1, carte: 1 },
    { champ: 'finDroits', fiche: '2026-12-31', carte: '2026-12-31' },
    { champ: 'ald', fiche: true, carte: true },
    { champ: 'amc', fiche: amcCarte, carte: amcCarte },
  ])('$champ', ({ champ, fiche: f, carte: c }) => {
    expect(valeurFiche(fiche, champ)).toEqual(f);
    expect(valeurCarte(carte, champ)).toEqual(c);
    expect(LIBELLES_CHAMPS_CARTE[champ]).not.toBe('');
  });

  it('champ AMO d’une fiche sans couverture : null', () => {
    expect(valeurFiche({ ...fiche, amo: null }, 'caisse')).toBeNull();
  });
});
