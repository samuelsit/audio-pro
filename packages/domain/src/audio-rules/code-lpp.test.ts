import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import { choisirCodeLpp, type EntreeCodeLpp } from './code-lpp';

function entree(surcharge: Partial<EntreeCodeLpp> = {}): EntreeCodeLpp {
  return {
    classe: 'CLASSE_I',
    oreille: 'DROITE',
    c2s: false,
    age: 66,
    baseRemboursement: centimes(40_000),
    candidats: [],
    ...surcharge,
  };
}

const candidat = (code: string, naturePrestation: string, base: number) => ({
  code,
  naturePrestation,
  baseRemboursement: centimes(base),
});

describe('choisirCodeLpp', () => {
  it.each([
    { classe: 'CLASSE_I', oreille: 'DROITE', age: 66, code: '2351057' },
    { classe: 'CLASSE_I', oreille: 'GAUCHE', age: 66, code: '2365119' },
    { classe: 'CLASSE_I', oreille: 'DROITE', age: 19, code: '2325120' },
    { classe: 'CLASSE_I', oreille: 'GAUCHE', age: 19, code: '2337749' },
    { classe: 'CLASSE_II', oreille: 'DROITE', age: 66, code: '2392530' },
    { classe: 'CLASSE_II', oreille: 'GAUCHE', age: 66, code: '2341840' },
    { classe: 'CLASSE_II', oreille: 'DROITE', age: 19, code: '2307926' },
    { classe: 'CLASSE_II', oreille: 'GAUCHE', age: 19, code: '2369117' },
  ] as const)('générique $classe $oreille à $age ans', ({ classe, oreille, age, code }) => {
    expect(choisirCodeLpp(entree({ classe, oreille, age }))).toEqual({ code, generique: true });
  });

  it('C2S : classe II pour un appareil de classe I (FR 201, test n° 5)', () => {
    const e = entree({ c2s: true, age: 19, baseRemboursement: centimes(140_000) });
    expect(choisirCodeLpp(e).code).toBe('2307926');
  });

  it('prend le code du modèle de même nature et de même base', () => {
    const candidats = [
      candidat('7310436', 'P1D', 140_000),
      candidat('7310442', 'P1D', 40_000),
      candidat('2351057', 'RJT', 40_000),
    ];
    expect(choisirCodeLpp(entree({ candidats }))).toEqual({ code: '7310442', generique: false });
  });

  it('écarte un code d’une autre oreille', () => {
    const candidats = [candidat('7310443', 'P1G', 40_000)];
    expect(choisirCodeLpp(entree({ candidats })).generique).toBe(true);
  });

  it('prend un code P2D du modèle pour la C2S', () => {
    const candidats = [candidat('7310500', 'P2D', 40_000)];
    const resultat = choisirCodeLpp(entree({ c2s: true, candidats }));
    expect(resultat).toEqual({ code: '7310500', generique: false });
  });
});
