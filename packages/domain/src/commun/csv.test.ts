import { describe, expect, it } from 'vitest';

import { celluleCsv, ligneCsv, versCsv } from './csv';

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
