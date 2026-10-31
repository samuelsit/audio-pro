import { describe, expect, it } from 'vitest';

import { telephoneCanonique, telephoneMobileSchema } from './telephone';

describe('telephoneCanonique', () => {
  it.each([
    { valeur: '0612345678', attendu: '+33612345678' },
    { valeur: '+33612345678', attendu: '+33612345678' },
    { valeur: '06 12 34 56 78', attendu: '+33612345678' },
    { valeur: '01.23.45.67.89', attendu: '+33123456789' },
    { valeur: '06-12-34-56-78', attendu: '+33612345678' },
    { valeur: '0012345678', attendu: null },
    { valeur: '061234567', attendu: null },
    { valeur: '+32612345678', attendu: null },
    { valeur: '', attendu: null },
  ])('$valeur → $attendu', ({ valeur, attendu }) => {
    expect(telephoneCanonique(valeur)).toBe(attendu);
  });
});

describe('telephoneMobileSchema', () => {
  it.each([
    { valeur: '06 12 34 56 78', attendu: '+33612345678' },
    { valeur: '07.12.34.56.78', attendu: '+33712345678' },
    { valeur: '+33612345678', attendu: '+33612345678' },
  ])('accepte $valeur', ({ valeur, attendu }) => {
    expect(telephoneMobileSchema.parse(valeur)).toBe(attendu);
  });

  it.each(['01 23 45 67 89', '+33123456789', '0812345678', 'abc', undefined])(
    'refuse %s',
    (valeur) => {
      expect(telephoneMobileSchema.safeParse(valeur).success).toBe(false);
    },
  );
});
