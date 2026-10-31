import { describe, expect, it } from 'vitest';

import { centreSaisieSchema } from './centre';
import { HORAIRES_VIDES } from './horaires';

const base = {
  nom: 'Centre Démo Nord',
  adresseLigne1: '12 rue de l’Exemple',
  adresseLigne2: '',
  codePostal: '59000',
  ville: 'Lille',
  finess: '',
  numeroFacturationAm: null,
  raisonSociale: ' Audition Démo SAS ',
  siret: '000 000 000 00000',
  rcs: 'RCS Démo 000 000 000',
  tvaIntracommunautaire: 'FR 00 000000000',
  email: 'nord@exemple.test',
  telephone: '03 00 00 00 01',
  actif: true,
};

describe('centreSaisieSchema', () => {
  it('normalise une saisie valide', () => {
    expect(centreSaisieSchema.parse(base)).toEqual({
      ...base,
      adresseLigne2: null,
      finess: null,
      numeroFacturationAm: null,
      raisonSociale: 'Audition Démo SAS',
      siret: '00000000000000',
      tvaIntracommunautaire: 'FR00000000000',
      telephone: '0300000001',
      horairesOuverture: HORAIRES_VIDES,
    });
  });

  it.each([
    { champ: 'telephone', saisie: '+33 3.00.00.00.01', attendu: '+33300000001' },
    { champ: 'telephone', saisie: '03-00-00-00-01', attendu: '0300000001' },
    { champ: 'codePostal', saisie: '75 001', attendu: '75001' },
    { champ: 'finess', saisie: ' 59 000 0000 ', attendu: '590000000' },
    { champ: 'numeroFacturationAm', saisie: '12 345 678 9', attendu: '123456789' },
    { champ: 'adresseLigne2', saisie: ' Bâtiment B ', attendu: 'Bâtiment B' },
  ])('$champ « $saisie » → « $attendu »', ({ champ, saisie, attendu }) => {
    const resultat = centreSaisieSchema.parse({ ...base, [champ]: saisie });
    expect(resultat[champ as keyof typeof resultat]).toBe(attendu);
  });

  it.each([
    { champ: 'nom', saisie: ' ', message: 'Le nom du centre est obligatoire.' },
    { champ: 'codePostal', saisie: '5900', message: 'Le code postal doit comporter 5 chiffres.' },
    { champ: 'codePostal', saisie: undefined, message: 'Le code postal est obligatoire.' },
    {
      champ: 'telephone',
      saisie: '00 00 00 00 00',
      message: 'Numéro de téléphone invalide (ex. 01 23 45 67 89).',
    },
    {
      champ: 'telephone',
      saisie: '03 00 00 00',
      message: 'Numéro de téléphone invalide (ex. 01 23 45 67 89).',
    },
    { champ: 'telephone', saisie: undefined, message: 'Le téléphone est obligatoire.' },
    { champ: 'email', saisie: 'nord', message: 'Adresse e-mail invalide.' },
    { champ: 'siret', saisie: '123', message: 'Le SIRET doit comporter 14 chiffres.' },
    { champ: 'siret', saisie: undefined, message: 'Le SIRET est obligatoire.' },
  ])('refuse $champ « $saisie »', ({ champ, saisie, message }) => {
    const resultat = centreSaisieSchema.safeParse({ ...base, [champ]: saisie });
    expect(resultat.error?.issues[0]?.path).toEqual([champ]);
    expect(resultat.error?.issues[0]?.message).toBe(message);
  });
});
