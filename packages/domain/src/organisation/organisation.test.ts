import { describe, expect, it } from 'vitest';

import {
  clientPeutSeConnecter,
  LIBELLES_STATUTS_ORGANISATION,
  organisationSaisieSchema,
  STATUTS_ORGANISATION,
} from './organisation';

const base = {
  raisonSociale: ' Audition Démo SAS ',
  siren: '000 000 000',
  adresseLigne1: '1 rue de l’Exemple',
  adresseLigne2: '',
  codePostal: '75 001',
  ville: 'Paris',
  statut: 'ESSAI',
  adminPrenom: 'Alex',
  adminNom: 'Démo',
  adminEmail: 'Alex@Exemple.test',
};

describe('statuts', () => {
  it.each(STATUTS_ORGANISATION)('%s a un libellé', (statut) => {
    expect(LIBELLES_STATUTS_ORGANISATION[statut]).not.toBe('');
  });

  it.each([
    { statut: 'ESSAI', attendu: true },
    { statut: 'ACTIF', attendu: true },
    { statut: 'SUSPENDU', attendu: false },
    { statut: null, attendu: true },
  ] as const)('$statut : connexion $attendu', ({ statut, attendu }) => {
    expect(clientPeutSeConnecter(statut)).toBe(attendu);
  });
});

describe('organisationSaisieSchema', () => {
  it('normalise une saisie valide', () => {
    expect(organisationSaisieSchema.parse(base)).toEqual({
      ...base,
      raisonSociale: 'Audition Démo SAS',
      siren: '000000000',
      adresseLigne2: null,
      codePostal: '75001',
      adminEmail: 'alex@exemple.test',
    });
  });

  it.each([
    { champ: 'raisonSociale', saisie: ' ', message: 'La raison sociale est obligatoire.' },
    { champ: 'siren', saisie: '12345678', message: 'Le SIREN doit comporter 9 chiffres.' },
    { champ: 'siren', saisie: undefined, message: 'Le SIREN est obligatoire.' },
    { champ: 'statut', saisie: 'SUSPENDU', message: 'Statut inconnu.' },
    { champ: 'adminEmail', saisie: 'alex', message: 'Adresse e-mail invalide.' },
  ])('refuse $champ « $saisie »', ({ champ, saisie, message }) => {
    const resultat = organisationSaisieSchema.safeParse({ ...base, [champ]: saisie });
    expect(resultat.error?.issues[0]?.path).toEqual([champ]);
    expect(resultat.error?.issues[0]?.message).toBe(message);
  });
});
