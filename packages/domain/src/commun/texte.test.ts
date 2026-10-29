import { describe, expect, it } from 'vitest';

import { retirerEspaces, texteObligatoire, texteOptionnelSchema } from './texte';

describe('texteObligatoire', () => {
  const schema = texteObligatoire('Le nom est obligatoire.', 5);

  it.each([
    { saisie: 'Nord', attendu: 'Nord' },
    { saisie: '  Nord  ', attendu: 'Nord' },
  ])('« $saisie » → « $attendu »', ({ saisie, attendu }) => {
    expect(schema.parse(saisie)).toBe(attendu);
  });

  it.each([
    { saisie: '', message: 'Le nom est obligatoire.' },
    { saisie: '   ', message: 'Le nom est obligatoire.' },
    { saisie: 'Trop long', message: '5 caractères au maximum.' },
    { saisie: undefined, message: 'Le nom est obligatoire.' },
  ])('refuse « $saisie »', ({ saisie, message }) => {
    const resultat = schema.safeParse(saisie);
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0]?.message).toBe(message);
  });
});

describe('texteOptionnelSchema', () => {
  it.each([
    { saisie: undefined, attendu: null },
    { saisie: null, attendu: null },
    { saisie: '', attendu: null },
    { saisie: '   ', attendu: null },
    { saisie: ' 123 ', attendu: '123' },
  ])('$saisie → $attendu', ({ saisie, attendu }) => {
    expect(texteOptionnelSchema.parse(saisie)).toBe(attendu);
  });
});

describe('retirerEspaces', () => {
  it.each([
    { saisie: '100 000 000 01', attendu: '10000000001' },
    { saisie: ' a\tb\nc ', attendu: 'abc' },
    { saisie: '', attendu: '' },
  ])('« $saisie » → « $attendu »', ({ saisie, attendu }) => {
    expect(retirerEspaces(saisie)).toBe(attendu);
  });
});
