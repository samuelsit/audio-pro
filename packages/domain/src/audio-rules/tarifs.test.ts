import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import {
  baseRemboursement,
  CODES_LPP_TARIFS_AUDIO,
  plafondC2S,
  plafondPrixVente,
  tarifsAudioDepuisLpp,
  type LigneTarifAudio,
  type TarifsAudio,
} from './tarifs';

const TARIFS: TarifsAudio = {
  VINGT_ET_PLUS: { baseRemboursement: centimes(40_000), prixLimiteClasseI: centimes(95_000) },
  MOINS_DE_20: { baseRemboursement: centimes(140_000), prixLimiteClasseI: centimes(140_000) },
};

describe('plafondPrixVente', () => {
  it.each([
    { classe: 'CLASSE_I', age: 20, c2s: false, attendu: 95_000, cas: 'classe I, 20 ans' },
    { classe: 'CLASSE_I', age: 72, c2s: false, attendu: 95_000, cas: 'classe I, adulte' },
    { classe: 'CLASSE_I', age: 19, c2s: false, attendu: 140_000, cas: 'classe I, 19 ans' },
    { classe: 'CLASSE_II', age: 72, c2s: false, attendu: null, cas: 'classe II, prix libre' },
    { classe: 'CLASSE_II', age: 12, c2s: false, attendu: null, cas: 'classe II, enfant' },
    { classe: 'CLASSE_I', age: 72, c2s: true, attendu: 80_000, cas: 'C2S classe I, adulte' },
    { classe: 'CLASSE_II', age: 72, c2s: true, attendu: 80_000, cas: 'C2S classe II, adulte' },
    { classe: 'CLASSE_I', age: 19, c2s: true, attendu: 140_000, cas: 'C2S classe I, 19 ans' },
    { classe: 'CLASSE_II', age: 19, c2s: true, attendu: 140_000, cas: 'C2S classe II, 19 ans' },
    {
      classe: 'CLASSE_I',
      age: 72,
      c2s: true,
      surdicecite: true,
      attendu: 140_000,
      cas: 'C2S, personne sourde et aveugle',
    },
    {
      classe: 'CLASSE_I',
      age: 72,
      c2s: false,
      surdicecite: true,
      attendu: 95_000,
      cas: 'hors C2S, surdicécité sans effet',
    },
    {
      classe: 'CLASSE_I',
      age: 72,
      c2s: true,
      refusOffreC2S: true,
      attendu: 95_000,
      cas: 'C2S, refus : prix limite général',
    },
    {
      classe: 'CLASSE_II',
      age: 72,
      c2s: true,
      refusOffreC2S: true,
      attendu: null,
      cas: 'C2S, refus : classe II libre',
    },
  ] as const)('$cas', ({ attendu, ...entree }) => {
    expect(plafondPrixVente(entree, TARIFS)).toBe(attendu);
  });
});

describe('plafondC2S', () => {
  it.each([
    { age: 19, surdicecite: false, attendu: 140_000 },
    { age: 20, surdicecite: false, attendu: 80_000 },
    { age: 20, surdicecite: true, attendu: 140_000 },
  ])('$age ans, surdicécité $surdicecite', ({ attendu, ...entree }) => {
    expect(plafondC2S(entree)).toBe(attendu);
  });
});

describe('baseRemboursement', () => {
  it.each([
    { age: 0, attendu: 140_000 },
    { age: 19, attendu: 140_000 },
    { age: 20, attendu: 40_000 },
    { age: 85, attendu: 40_000 },
  ])('$age ans', ({ age, attendu }) => {
    expect(baseRemboursement({ age }, TARIFS)).toBe(attendu);
  });
});

describe('tarifsAudioDepuisLpp', () => {
  const adulte = { baseRemboursementCentimes: 40_000, prixLimiteVenteCentimes: 95_000 };
  const jeune = { baseRemboursementCentimes: 140_000, prixLimiteVenteCentimes: 140_000 };

  it('lit les deux tranches dans les lignes LPP', () => {
    const lignes = new Map([
      [CODES_LPP_TARIFS_AUDIO.VINGT_ET_PLUS, adulte],
      [CODES_LPP_TARIFS_AUDIO.MOINS_DE_20, jeune],
    ]);
    expect(tarifsAudioDepuisLpp(lignes)).toEqual(TARIFS);
  });

  it.each<{ cas: string; lignes: [string, LigneTarifAudio | null][] }>([
    { cas: 'tranche haute absente', lignes: [[CODES_LPP_TARIFS_AUDIO.MOINS_DE_20, jeune]] },
    { cas: 'tranche basse absente', lignes: [[CODES_LPP_TARIFS_AUDIO.VINGT_ET_PLUS, adulte]] },
    {
      cas: 'code sans tarif à cette date',
      lignes: [
        [CODES_LPP_TARIFS_AUDIO.VINGT_ET_PLUS, null],
        [CODES_LPP_TARIFS_AUDIO.MOINS_DE_20, jeune],
      ],
    },
    {
      cas: 'classe I sans prix limite',
      lignes: [
        [CODES_LPP_TARIFS_AUDIO.VINGT_ET_PLUS, { ...adulte, prixLimiteVenteCentimes: null }],
        [CODES_LPP_TARIFS_AUDIO.MOINS_DE_20, jeune],
      ],
    },
  ])('$cas → null', ({ lignes }) => {
    expect(tarifsAudioDepuisLpp(new Map(lignes))).toBeNull();
  });
});
