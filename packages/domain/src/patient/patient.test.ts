import { describe, expect, it } from 'vitest';

import { erreurDateNaissance, patientSaisieSchema } from './patient';

/** Saisie minimale valide, telle que la produit le formulaire (champs vides = chaînes vides). */
const saisieMinimale = {
  centreId: 'centre-a',
  civilite: 'MME',
  nomNaissance: ' Lefèvre ',
  nomUsage: '',
  prenoms: 'Jeanne Marie',
  dateNaissance: '05/03/1950',
  sexe: 'FEMININ',
  adresseLigne1: '',
  adresseLigne2: '',
  codePostal: '',
  ville: '',
  telephone: '',
  email: '',
  medecinTraitant: '',
  consentementSms: false,
  consentementEmail: false,
  consentementCourrier: false,
  notes: '',
  amoNir: '',
  amoRangNaissance: '1',
  amoQualite: 'ASSURE',
  amoRegime: '',
  amoCaisse: '',
  amoCentreGestionnaire: '',
  amoFinDroits: '',
  amoC2s: false,
  amoAld: false,
  amcOrganismeNom: '',
  amcOrganismeIdentifiant: '',
  amcNumeroAdherent: '',
  amcTypeContrat: '',
  amcDebutValidite: '',
  amcFinValidite: '',
};

function erreurs(saisie: Record<string, unknown>): Record<string, string> {
  const resultat = patientSaisieSchema.safeParse(saisie);
  return Object.fromEntries(
    (resultat.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe('patientSaisieSchema', () => {
  it('accepte une fiche minimale, sans couverture', () => {
    expect(patientSaisieSchema.parse(saisieMinimale)).toEqual({
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
      consentementSmsCommercial: false,
      consentementEmailCommercial: false,
      consentementCourrierCommercial: false,
      notes: null,
      amo: null,
      amc: null,
    });
  });

  it('accepte une fiche complète avec AMO et AMC', () => {
    const fiche = patientSaisieSchema.parse({
      ...saisieMinimale,
      nomUsage: 'Martin',
      adresseLigne1: '1 rue Fictive',
      codePostal: '75 000',
      ville: 'Paris',
      telephone: '06 00 00 00 01',
      email: 'Jeanne@Exemple.test',
      medecinTraitant: 'Dr Fictif',
      consentementSms: true,
      notes: 'Note',
      amoNir: '2 69 01 49 999 123 39',
      amoRangNaissance: ' 2 ',
      amoQualite: 'AYANT_DROIT',
      amoRegime: '01',
      amoCaisse: '751',
      amoCentreGestionnaire: '0000',
      amoFinDroits: '2027-12-31',
      amoC2s: true,
      amoAld: true,
      amcOrganismeNom: 'Mutuelle Démo',
      amcOrganismeIdentifiant: '99999999',
      amcNumeroAdherent: 'A123',
      amcTypeContrat: 'Responsable',
      amcDebutValidite: '01/01/2026',
      amcFinValidite: '31/12/2026',
    });
    expect(fiche).toMatchObject({
      codePostal: '75000',
      telephone: '0600000001',
      email: 'jeanne@exemple.test',
      amo: {
        nir: '269014999912339',
        rangNaissance: 2,
        qualite: 'AYANT_DROIT',
        regime: '01',
        caisse: '751',
        centreGestionnaire: '0000',
        finDroits: '2027-12-31',
        c2s: true,
        ald: true,
      },
      amc: {
        organismeNom: 'Mutuelle Démo',
        organismeIdentifiant: '99999999',
        numeroAdherent: 'A123',
        typeContrat: 'Responsable',
        debutValidite: '2026-01-01',
        finValidite: '2026-12-31',
      },
    });
  });

  it.each([
    {
      cas: 'nom absent',
      saisie: { nomNaissance: ' ' },
      champ: 'nomNaissance',
      message: 'Le nom de naissance est obligatoire.',
    },
    {
      cas: 'prénom absent',
      saisie: { prenoms: '' },
      champ: 'prenoms',
      message: 'Le prénom est obligatoire.',
    },
    {
      cas: 'centre absent',
      saisie: { centreId: '' },
      champ: 'centreId',
      message: 'Le centre de rattachement est obligatoire.',
    },
    {
      cas: 'date de naissance absente',
      saisie: { dateNaissance: '' },
      champ: 'dateNaissance',
      message: 'La date de naissance est obligatoire.',
    },
    {
      cas: 'date de naissance inexistante',
      saisie: { dateNaissance: '30/02/1950' },
      champ: 'dateNaissance',
      message: 'Cette date n’existe pas.',
    },
    {
      cas: 'civilité inconnue',
      saisie: { civilite: 'DR' },
      champ: 'civilite',
      message: 'Civilité invalide.',
    },
    { cas: 'sexe inconnu', saisie: { sexe: 'X' }, champ: 'sexe', message: 'Sexe invalide.' },
    {
      cas: 'code postal',
      saisie: { codePostal: '7500' },
      champ: 'codePostal',
      message: 'Le code postal doit comporter 5 chiffres.',
    },
    {
      cas: 'téléphone',
      saisie: { telephone: '12' },
      champ: 'telephone',
      message: 'Numéro de téléphone invalide (ex. 01 23 45 67 89).',
    },
    {
      cas: 'e-mail',
      saisie: { email: 'pas-un-email' },
      champ: 'email',
      message: 'Adresse e-mail invalide.',
    },
    {
      cas: 'notes trop longues',
      saisie: { notes: 'x'.repeat(5001) },
      champ: 'notes',
      message: '5000 caractères au maximum.',
    },
    {
      cas: 'NIR à clé fausse',
      saisie: { amoNir: '269014999912338' },
      champ: 'amoNir',
      message: 'La clé du NIR ne correspond pas au numéro : vérifiez la saisie.',
    },
    {
      cas: 'champ AMO sans NIR',
      saisie: { amoCaisse: '751' },
      champ: 'amoNir',
      message: 'Le NIR est obligatoire pour enregistrer la couverture AMO.',
    },
    {
      cas: 'C2S sans NIR',
      saisie: { amoC2s: true },
      champ: 'amoNir',
      message: 'Le NIR est obligatoire pour enregistrer la couverture AMO.',
    },
    {
      cas: 'ALD sans NIR',
      saisie: { amoAld: true },
      champ: 'amoNir',
      message: 'Le NIR est obligatoire pour enregistrer la couverture AMO.',
    },
    {
      cas: 'rang de naissance 0',
      saisie: { amoNir: '269014999912339', amoRangNaissance: '0' },
      champ: 'amoRangNaissance',
      message: 'Le rang de naissance est un chiffre de 1 à 9.',
    },
    {
      cas: 'rang de naissance absent',
      saisie: { amoNir: '269014999912339', amoRangNaissance: undefined },
      champ: 'amoRangNaissance',
      message: 'Le rang de naissance est un chiffre de 1 à 9.',
    },
    {
      cas: 'qualité inconnue',
      saisie: { amoNir: '269014999912339', amoQualite: 'CONJOINT' },
      champ: 'amoQualite',
      message: 'Qualité invalide.',
    },
    {
      cas: 'régime non numérique',
      saisie: { amoNir: '269014999912339', amoRegime: 'RG' },
      champ: 'amoRegime',
      message: 'Régime : chiffres uniquement.',
    },
    {
      cas: 'champ AMC sans organisme',
      saisie: { amcNumeroAdherent: 'A1' },
      champ: 'amcOrganismeNom',
      message: 'L’organisme complémentaire est obligatoire pour enregistrer la couverture AMC.',
    },
    {
      cas: 'période AMC inversée',
      saisie: {
        amcOrganismeNom: 'M',
        amcDebutValidite: '2026-12-31',
        amcFinValidite: '2026-01-01',
      },
      champ: 'amcFinValidite',
      message: 'La fin de validité doit être postérieure ou égale au début.',
    },
  ])('refuse : $cas', ({ saisie, champ, message }) => {
    expect(erreurs({ ...saisieMinimale, ...saisie })[champ]).toBe(message);
  });

  it('accepte une période AMC ouverte', () => {
    const fiche = patientSaisieSchema.parse({
      ...saisieMinimale,
      amcOrganismeNom: 'Mutuelle Démo',
      amcDebutValidite: '2026-01-01',
    });
    expect(fiche.amc).toMatchObject({ debutValidite: '2026-01-01', finValidite: null });
  });
});

describe('erreurDateNaissance', () => {
  it.each([
    { date: '1950-03-05', attendu: null },
    { date: '2026-10-29', attendu: null },
    { date: '1900-01-01', attendu: null },
    { date: '2026-10-30', attendu: 'La date de naissance ne peut pas être dans le futur.' },
    {
      date: '1899-12-31',
      attendu: 'La date de naissance doit être postérieure au 1er janvier 1900.',
    },
  ])('$date → $attendu', ({ date, attendu }) => {
    expect(erreurDateNaissance(date, '2026-10-29')).toBe(attendu);
  });
});
