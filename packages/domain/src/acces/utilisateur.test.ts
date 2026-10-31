import { describe, expect, it } from 'vitest';

import { emailSchema, motDePasseSchema, nomAffiche, utilisateurSaisieSchema } from './utilisateur';

describe('motDePasseSchema', () => {
  it.each(['a'.repeat(12), 'Correct horse battery', 'x'.repeat(128)])('accepte %s', (mdp) => {
    expect(motDePasseSchema.safeParse(mdp).success).toBe(true);
  });

  it.each([
    { mdp: '', message: 'Le mot de passe doit comporter au moins 12 caractères.' },
    { mdp: 'a'.repeat(11), message: 'Le mot de passe doit comporter au moins 12 caractères.' },
    { mdp: 'a'.repeat(129), message: 'Le mot de passe doit comporter au plus 128 caractères.' },
    { mdp: undefined, message: 'Le mot de passe est obligatoire.' },
  ])('refuse $mdp', ({ mdp, message }) => {
    expect(motDePasseSchema.safeParse(mdp).error?.issues[0]?.message).toBe(message);
  });
});

describe('emailSchema', () => {
  it.each([
    { saisie: 'claire.martin@exemple.test', attendu: 'claire.martin@exemple.test' },
    { saisie: '  Claire.Martin@Exemple.TEST ', attendu: 'claire.martin@exemple.test' },
  ])('« $saisie » → $attendu', ({ saisie, attendu }) => {
    expect(emailSchema.parse(saisie)).toBe(attendu);
  });

  it.each(['', 'pas-un-email', 'a@', '@exemple.test'])('refuse « %s »', (saisie) => {
    expect(emailSchema.safeParse(saisie).error?.issues[0]?.message).toBe(
      'Adresse e-mail invalide.',
    );
  });
});

describe('utilisateurSaisieSchema', () => {
  const base = {
    prenom: ' Claire ',
    nom: 'Martin',
    email: 'claire@exemple.test',
    role: 'ASSISTANT',
    centreIds: ['A'],
    actif: true,
  };

  it.each([
    { cas: 'assistant rattaché', saisie: base, centreIds: ['A'] },
    {
      cas: 'doublons retirés',
      saisie: { ...base, centreIds: ['A', 'B', 'A'] },
      centreIds: ['A', 'B'],
    },
    {
      cas: 'admin sans centre',
      saisie: { ...base, role: 'ADMIN_CLIENT', centreIds: [] },
      centreIds: [],
    },
  ])('accepte : $cas', ({ saisie, centreIds }) => {
    const resultat = utilisateurSaisieSchema.parse(saisie);
    expect(resultat.prenom).toBe('Claire');
    expect(resultat.centreIds).toEqual(centreIds);
  });

  it.each([
    { cas: 'assistant sans centre', saisie: { ...base, centreIds: [] }, champ: 'centreIds' },
    {
      cas: 'audio sans centre',
      saisie: { ...base, role: 'AUDIO', centreIds: [] },
      champ: 'centreIds',
    },
    { cas: 'prénom vide', saisie: { ...base, prenom: '  ' }, champ: 'prenom' },
    { cas: 'rôle inconnu', saisie: { ...base, role: 'STAGIAIRE' }, champ: 'role' },
  ])('refuse : $cas', ({ saisie, champ }) => {
    const resultat = utilisateurSaisieSchema.safeParse(saisie);
    expect(resultat.error?.issues.map((issue) => issue.path[0])).toContain(champ);
  });
});

describe('nomAffiche', () => {
  it('concatène prénom et nom', () => {
    expect(nomAffiche('Claire', 'Martin')).toBe('Claire Martin');
  });
});
