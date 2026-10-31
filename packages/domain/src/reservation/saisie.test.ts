import { describe, expect, it } from 'vitest';

import {
  choixCreneauSchema,
  codeSmsSchema,
  coordonneesReservationSchema,
  deplacementEnLigneSchema,
  lectureCreneauxSchema,
  parametresReservationSchema,
} from './saisie';

const COORDONNEES = {
  nom: 'Exemple',
  prenom: 'Camille',
  dateNaissance: '02/03/1950',
  telephone: '06 12 34 56 78',
  email: '',
  motif: ' ',
  consentementRgpd: true,
  consentementSms: false,
};

describe('coordonneesReservationSchema', () => {
  it('canonise le téléphone, la date, et rend nuls les champs facultatifs vides', () => {
    expect(coordonneesReservationSchema.parse(COORDONNEES)).toMatchObject({
      dateNaissance: '1950-03-02',
      telephone: '+33612345678',
      email: null,
      motif: null,
    });
  });

  it('garde l’e-mail et le motif', () => {
    expect(
      coordonneesReservationSchema.parse({
        ...COORDONNEES,
        email: 'camille@exemple.test',
        motif: 'Contrôle',
      }),
    ).toMatchObject({ email: 'camille@exemple.test', motif: 'Contrôle' });
  });

  it.each([
    { cas: 'sans consentement', champ: { consentementRgpd: false } },
    { cas: 'consentement absent', champ: { consentementRgpd: undefined } },
    { cas: 'téléphone fixe', champ: { telephone: '01 23 45 67 89' } },
    { cas: 'date vide', champ: { dateNaissance: '' } },
    { cas: 'date absente', champ: { dateNaissance: undefined } },
    { cas: 'date impossible', champ: { dateNaissance: '31/02/1950' } },
    { cas: 'e-mail invalide', champ: { email: 'non' } },
    { cas: 'motif trop long', champ: { motif: 'x'.repeat(501) } },
    { cas: 'nom vide', champ: { nom: ' ' } },
    { cas: 'prénom absent', champ: { prenom: undefined } },
  ])('refuse : $cas', ({ champ }) => {
    expect(coordonneesReservationSchema.safeParse({ ...COORDONNEES, ...champ }).success).toBe(
      false,
    );
  });
});

describe('codeSmsSchema', () => {
  it('accepte six chiffres, espaces de bord retirés', () => {
    expect(codeSmsSchema.parse(' 012345 ')).toBe('012345');
  });

  it.each(['12345', '1234567', 'abcdef', '', undefined])('refuse %s', (valeur) => {
    expect(codeSmsSchema.safeParse(valeur).success).toBe(false);
  });
});

describe('choixCreneauSchema et deplacementEnLigneSchema', () => {
  const CHOIX = { typeRdvId: 't1', praticienId: '', debut: '1800000000000', captcha: 'preuve' };

  it('rend « peu importe » nul et l’instant numérique', () => {
    expect(choixCreneauSchema.parse(CHOIX)).toEqual({
      typeRdvId: 't1',
      praticienId: null,
      debut: 1_800_000_000_000,
      captcha: 'preuve',
    });
    expect(deplacementEnLigneSchema.parse({ debut: 1_800_000_000_000 })).toEqual({
      debut: 1_800_000_000_000,
      praticienId: null,
    });
  });

  it.each([
    { cas: 'instant non entier', champ: { debut: '1.5' } },
    { cas: 'instant absurde', champ: { debut: 'abc' } },
    { cas: 'instant négatif', champ: { debut: '-1' } },
    { cas: 'captcha vide', champ: { captcha: '' } },
    { cas: 'type absent', champ: { typeRdvId: undefined } },
  ])('refuse : $cas', ({ champ }) => {
    expect(choixCreneauSchema.safeParse({ ...CHOIX, ...champ }).success).toBe(false);
  });
});

describe('lectureCreneauxSchema', () => {
  it('valide la date de départ', () => {
    expect(lectureCreneauxSchema.safeParse({ typeRdvId: 't1', depuis: '2027-02-30' }).success).toBe(
      false,
    );
    expect(lectureCreneauxSchema.parse({ typeRdvId: 't1', depuis: '2027-02-28' })).toEqual({
      typeRdvId: 't1',
      praticienId: null,
      depuis: '2027-02-28',
    });
  });
});

describe('parametresReservationSchema', () => {
  const PARAMETRES = {
    actif: true,
    delaiMinimalMinutes: '60',
    horizonJours: '30',
    validation: 'MANUELLE',
    delaiModificationHeures: '24',
    typeRdvIds: ['t1'],
    slug: 'centre-nord',
  };

  it('convertit les nombres saisis', () => {
    expect(parametresReservationSchema.parse(PARAMETRES)).toMatchObject({
      delaiMinimalMinutes: 60,
      horizonJours: 30,
      delaiModificationHeures: 24,
    });
  });

  it.each([
    { cas: 'délai négatif', champ: { delaiMinimalMinutes: '-1' } },
    { cas: 'délai trop long', champ: { delaiMinimalMinutes: String(60 * 24 * 60 + 1) } },
    { cas: 'horizon nul', champ: { horizonJours: '0' } },
    { cas: 'horizon trop long', champ: { horizonJours: '366' } },
    { cas: 'validation inconnue', champ: { validation: 'AUTRE' } },
    { cas: 'délai de modification négatif', champ: { delaiModificationHeures: '-1' } },
    { cas: 'délai de modification trop long', champ: { delaiModificationHeures: '1441' } },
    { cas: 'adresse invalide', champ: { slug: 'Centre Nord !' } },
  ])('refuse : $cas', ({ champ }) => {
    expect(parametresReservationSchema.safeParse({ ...PARAMETRES, ...champ }).success).toBe(false);
  });
});
