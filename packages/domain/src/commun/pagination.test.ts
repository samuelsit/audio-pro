import { describe, expect, it } from 'vitest';

import { calculerPagination, pageSchema } from './pagination';

describe('calculerPagination', () => {
  it.each([
    { page: 1, total: 0, attendu: { page: 1, nbPages: 1, decalage: 0 } },
    { page: 1, total: 50, attendu: { page: 1, nbPages: 1, decalage: 0 } },
    { page: 2, total: 51, attendu: { page: 2, nbPages: 2, decalage: 50 } },
    { page: 9, total: 120, attendu: { page: 3, nbPages: 3, decalage: 100 } },
    { page: 0, total: 120, attendu: { page: 1, nbPages: 3, decalage: 0 } },
  ])('page $page sur $total lignes', ({ page, total, attendu }) => {
    expect(calculerPagination(page, 50, total)).toEqual({ ...attendu, parPage: 50, total });
  });
});

describe('pageSchema', () => {
  it.each([
    { saisie: '4', attendu: 4 },
    { saisie: undefined, attendu: 1 },
    { saisie: '0', attendu: 1 },
    { saisie: '1.5', attendu: 1 },
    { saisie: 'deux', attendu: 1 },
  ])('$saisie → $attendu', ({ saisie, attendu }) => {
    expect(pageSchema.parse(saisie)).toBe(attendu);
  });
});
