import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { celluleCsv, interpreterCsv, ligneCsv, lireCsv, versCsv } from './csv';

describe('celluleCsv', () => {
  it.each([
    { valeur: null, attendu: '' },
    { valeur: 'Centre A', attendu: 'Centre A' },
    { valeur: 42, attendu: '42' },
    { valeur: -3, attendu: '-3' },
    { valeur: true, attendu: 'true' },
    { valeur: 'a;b', attendu: '"a;b"' },
    { valeur: 'dit "bonjour"', attendu: '"dit ""bonjour"""' },
    { valeur: 'ligne 1\nligne 2', attendu: '"ligne 1\nligne 2"' },
    { valeur: '=SOMME(A1:A2)', attendu: "'=SOMME(A1:A2)" },
    { valeur: '+33 1', attendu: "'+33 1" },
    { valeur: '-1+1', attendu: "'-1+1" },
    { valeur: '@cmd', attendu: "'@cmd" },
    { valeur: '\tx', attendu: "'\tx" },
    { valeur: '=a;b', attendu: `"'=a;b"` },
  ])('$valeur → $attendu', ({ valeur, attendu }) => {
    expect(celluleCsv(valeur)).toBe(attendu);
  });
});

describe('versCsv', () => {
  it('assemble l’en-tête et les lignes en CRLF', () => {
    expect(
      versCsv(
        ['Nom', 'Actif'],
        [
          ['A', true],
          ['B;C', null],
        ],
      ),
    ).toBe('Nom;Actif\r\nA;true\r\n"B;C";\r\n');
    expect(ligneCsv([])).toBe('\r\n');
  });
});

describe('lireCsv', () => {
  it.each([
    {
      cas: 'CRLF',
      texte: 'a;b\r\nc;d\r\n',
      attendu: [
        { numero: 1, cellules: ['a', 'b'] },
        { numero: 2, cellules: ['c', 'd'] },
      ],
    },
    {
      cas: 'LF sans fin de ligne finale',
      texte: 'a;b\nc;d',
      attendu: [
        { numero: 1, cellules: ['a', 'b'] },
        { numero: 2, cellules: ['c', 'd'] },
      ],
    },
    { cas: 'BOM', texte: '﻿a;b', attendu: [{ numero: 1, cellules: ['a', 'b'] }] },
    { cas: 'cellule vide', texte: 'a;;b', attendu: [{ numero: 1, cellules: ['a', '', 'b'] }] },
    {
      cas: 'guillemets',
      texte: '"a;b";"dit ""oui"""',
      attendu: [{ numero: 1, cellules: ['a;b', 'dit "oui"'] }],
    },
    {
      cas: 'lignes vides sautées',
      texte: 'a\n\n;\nb\n',
      attendu: [
        { numero: 1, cellules: ['a'] },
        { numero: 4, cellules: ['b'] },
      ],
    },
    {
      cas: 'saut de ligne dans une cellule',
      texte: '"a\nb";c\nd',
      attendu: [
        { numero: 1, cellules: ['a\nb', 'c'] },
        { numero: 3, cellules: ['d'] },
      ],
    },
    { cas: 'fichier vide', texte: '', attendu: [] },
  ])('$cas', ({ texte, attendu }) => {
    expect(lireCsv(texte)).toEqual(attendu);
  });

  it('relit ce que versCsv écrit', () => {
    const lignes = [
      ['a;b', 'dit "oui"'],
      ['ligne 1\nligne 2', ''],
    ];
    const relu = lireCsv(versCsv(['x', 'y'], lignes));
    expect(relu?.map((l) => l.cellules)).toEqual([['x', 'y'], ...lignes]);
  });

  it('signale un guillemet non refermé', () => {
    expect(lireCsv('"a;b')).toBeNull();
  });
});

describe('interpreterCsv', () => {
  const schema = z.object({ nom: z.string().min(1, 'Nom vide.'), age: z.coerce.number() });
  const entetes = ['nom', 'age'];

  it('valide chaque ligne et donne son numéro', () => {
    expect(interpreterCsv(' NOM ;Age\n Ana ;42\n\nBo;7\n', entetes, schema)).toEqual({
      lignes: [
        { ligne: 2, valeur: { nom: 'Ana', age: 42 } },
        { ligne: 4, valeur: { nom: 'Bo', age: 7 } },
      ],
      erreurs: [],
    });
  });

  it('garde les lignes valides et liste les autres', () => {
    const { lignes, erreurs } = interpreterCsv('nom;age\n;1\nAna\nBo;2\n', entetes, schema);
    expect(lignes).toEqual([{ ligne: 4, valeur: { nom: 'Bo', age: 2 } }]);
    expect(erreurs).toEqual([
      { ligne: 2, message: 'nom : Nom vide.' },
      { ligne: 3, message: '2 colonnes attendues.' },
    ]);
  });

  it.each([
    { cas: 'fichier vide', texte: '', message: 'En-tête attendu : nom;age' },
    { cas: 'mauvais en-tête', texte: 'prenom;age\nA;1', message: 'En-tête attendu : nom;age' },
    {
      cas: 'guillemet ouvert',
      texte: '"nom;age',
      message: 'Guillemet non refermé dans le fichier.',
    },
  ])('refuse : $cas', ({ texte, message }) => {
    expect(interpreterCsv(texte, entetes, schema)).toEqual({
      lignes: [],
      erreurs: [{ ligne: 1, message }],
    });
  });
});
