import { describe, expect, it } from 'vitest';

import { codePrestation } from './code-prestation';

describe('codePrestation', () => {
  it.each([
    { classe: 'CLASSE_I', oreille: 'GAUCHE', c2s: false, attendu: 'P1G' },
    { classe: 'CLASSE_I', oreille: 'DROITE', c2s: false, attendu: 'P1D' },
    { classe: 'CLASSE_II', oreille: 'GAUCHE', c2s: false, attendu: 'P2G' },
    { classe: 'CLASSE_II', oreille: 'DROITE', c2s: false, attendu: 'P2D' },
    { classe: 'CLASSE_I', oreille: 'GAUCHE', c2s: true, attendu: 'P2G' },
    { classe: 'CLASSE_I', oreille: 'DROITE', c2s: true, attendu: 'P2D' },
    { classe: 'CLASSE_II', oreille: 'GAUCHE', c2s: true, attendu: 'P2G' },
    { classe: 'CLASSE_II', oreille: 'DROITE', c2s: true, attendu: 'P2D' },
  ] as const)('$classe, $oreille, C2S $c2s → $attendu', ({ attendu, ...entree }) => {
    expect(codePrestation(entree)).toBe(attendu);
  });

  it.each([
    { nature: 'PILE', attendu: 'PIL' },
    { nature: 'ACCESSOIRE', attendu: 'APA' },
  ] as const)('$nature → $attendu', ({ nature, attendu }) => {
    expect(codePrestation({ nature })).toBe(attendu);
  });
});
