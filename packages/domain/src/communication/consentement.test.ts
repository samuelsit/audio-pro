import { describe, expect, it } from 'vitest';

import {
  adresseCanonique,
  adresseMessage,
  champConsentement,
  choisirCanal,
  decisionEnvoi,
  mobileCanonique,
  type PatientMessage,
} from './consentement';

const PATIENT: PatientMessage = {
  telephone: '06 12 34 56 78',
  email: 'Prenom.Nom@Exemple.Test',
  adresseLigne1: '1 rue de la Paix',
  codePostal: '75002',
  ville: 'Paris',
  consentementSms: true,
  consentementEmail: true,
  consentementCourrier: true,
  consentementSmsCommercial: false,
  consentementEmailCommercial: false,
  consentementCourrierCommercial: false,
};

describe('champConsentement', () => {
  it.each([
    ['SMS', 'SUIVI', 'consentementSms'],
    ['EMAIL', 'SUIVI', 'consentementEmail'],
    ['COURRIER', 'SUIVI', 'consentementCourrier'],
    ['SMS', 'COMMERCIAL', 'consentementSmsCommercial'],
    ['EMAIL', 'COMMERCIAL', 'consentementEmailCommercial'],
    ['COURRIER', 'COMMERCIAL', 'consentementCourrierCommercial'],
  ] as const)('%s, %s', (canal, finalite, champ) => {
    expect(champConsentement(canal, finalite)).toBe(champ);
  });
});

describe('mobileCanonique', () => {
  it.each([
    ['06 12 34 56 78', '+33612345678'],
    ['07.12.34.56.78', '+33712345678'],
    ['+33612345678', '+33612345678'],
    ['01 23 45 67 89', null],
    ['pas un numéro', null],
    [null, null],
  ])('%s', (saisie, attendu) => {
    expect(mobileCanonique(saisie)).toBe(attendu);
  });
});

describe('adresseCanonique', () => {
  it('ramène un e-mail à une seule écriture', () => {
    expect(adresseCanonique('EMAIL', ' A@B.Test ')).toBe('a@b.test');
  });

  it('laisse la casse des autres canaux', () => {
    expect(adresseCanonique('COURRIER', ' Rue Haute ')).toBe('Rue Haute');
  });
});

describe('adresseMessage', () => {
  it.each([
    ['SMS', PATIENT, '+33612345678'],
    ['EMAIL', PATIENT, 'prenom.nom@exemple.test'],
    ['EMAIL', { ...PATIENT, email: null }, null],
    ['COURRIER', PATIENT, '1 rue de la Paix, 75002 Paris'],
    ['COURRIER', { ...PATIENT, adresseLigne1: null }, null],
    ['COURRIER', { ...PATIENT, codePostal: null }, null],
    ['COURRIER', { ...PATIENT, ville: null }, null],
  ] as const)('%s', (canal, patient, attendu) => {
    expect(adresseMessage(patient, canal)).toBe(attendu);
  });
});

describe('decisionEnvoi', () => {
  it.each([
    ['suivi consenti', PATIENT, 'SMS', 'SUIVI', false, null],
    ['commercial non consenti', PATIENT, 'SMS', 'COMMERCIAL', false, 'SANS_CONSENTEMENT'],
    [
      'commercial consenti',
      { ...PATIENT, consentementEmailCommercial: true },
      'EMAIL',
      'COMMERCIAL',
      false,
      null,
    ],
    [
      'un consentement commercial ne couvre pas le suivi',
      { ...PATIENT, consentementSms: false, consentementSmsCommercial: true },
      'SMS',
      'SUIVI',
      false,
      'SANS_CONSENTEMENT',
    ],
    ['sans adresse', { ...PATIENT, telephone: null }, 'SMS', 'SUIVI', false, 'SANS_ADRESSE'],
    ['fixe', { ...PATIENT, telephone: '0123456789' }, 'SMS', 'SUIVI', false, 'SANS_ADRESSE'],
    ['opposition, même sur un rappel', PATIENT, 'SMS', 'SUIVI', true, 'OPPOSITION'],
    [
      'l’opposition passe avant l’adresse manquante',
      { ...PATIENT, telephone: null },
      'SMS',
      'SUIVI',
      true,
      'OPPOSITION',
    ],
  ] as const)('%s', (_, patient, canal, finalite, opposition, motif) => {
    const decision = decisionEnvoi(patient, canal, finalite, opposition);
    expect(decision.autorise ? null : decision.motif).toBe(motif);
  });

  it('rend l’adresse canonique', () => {
    expect(decisionEnvoi(PATIENT, 'SMS', 'SUIVI', false)).toEqual({
      autorise: true,
      canal: 'SMS',
      adresse: '+33612345678',
    });
  });
});

describe('choisirCanal', () => {
  it('prend le premier canal autorisé', () => {
    expect(choisirCanal(PATIENT, ['SMS', 'EMAIL'], 'SUIVI', []).canal).toBe('SMS');
  });

  it('passe au suivant sous opposition', () => {
    expect(choisirCanal(PATIENT, ['SMS', 'EMAIL'], 'SUIVI', ['SMS']).canal).toBe('EMAIL');
  });

  it('rend le refus du premier canal si aucun n’est autorisé', () => {
    expect(choisirCanal(PATIENT, ['EMAIL', 'SMS'], 'COMMERCIAL', [])).toEqual({
      autorise: false,
      canal: 'EMAIL',
      motif: 'SANS_CONSENTEMENT',
    });
  });
});
