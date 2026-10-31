import { describe, expect, it } from 'vitest';

import { contient, intersecter, seChevauchent, soustraire, unir } from './intervalles';

const i = (debut: number, fin: number) => ({ debut, fin });

describe('seChevauchent', () => {
  it.each([
    { a: i(0, 10), b: i(5, 15), attendu: true, cas: 'recouvrement' },
    { a: i(0, 10), b: i(2, 3), attendu: true, cas: 'inclusion' },
    { a: i(0, 10), b: i(10, 20), attendu: false, cas: 'bout à bout' },
    { a: i(10, 20), b: i(0, 10), attendu: false, cas: 'bout à bout, inversé' },
  ])('$cas', ({ a, b, attendu }) => {
    expect(seChevauchent(a, b)).toBe(attendu);
  });
});

describe('unir', () => {
  it.each([
    { cas: 'vide', entree: [], attendu: [] },
    { cas: 'tri', entree: [i(5, 6), i(1, 2)], attendu: [i(1, 2), i(5, 6)] },
    { cas: 'fusion', entree: [i(1, 5), i(3, 8)], attendu: [i(1, 8)] },
    { cas: 'bout à bout', entree: [i(1, 5), i(5, 8)], attendu: [i(1, 8)] },
    { cas: 'inclusion', entree: [i(1, 9), i(3, 4)], attendu: [i(1, 9)] },
    { cas: 'intervalle vide écarté', entree: [i(3, 3), i(5, 4)], attendu: [] },
  ])('$cas', ({ entree, attendu }) => {
    expect(unir(entree)).toEqual(attendu);
  });
});

describe('soustraire', () => {
  it.each([
    { cas: 'sans retrait', base: [i(0, 10)], retraits: [], attendu: [i(0, 10)] },
    { cas: 'milieu', base: [i(0, 10)], retraits: [i(3, 4)], attendu: [i(0, 3), i(4, 10)] },
    { cas: 'début', base: [i(0, 10)], retraits: [i(0, 4)], attendu: [i(4, 10)] },
    { cas: 'fin', base: [i(0, 10)], retraits: [i(8, 12)], attendu: [i(0, 8)] },
    { cas: 'tout', base: [i(0, 10)], retraits: [i(0, 10)], attendu: [] },
    { cas: 'à côté', base: [i(0, 10)], retraits: [i(20, 30)], attendu: [i(0, 10)] },
    {
      cas: 'plusieurs',
      base: [i(0, 10), i(20, 30)],
      retraits: [i(5, 25), i(27, 28)],
      attendu: [i(0, 5), i(25, 27), i(28, 30)],
    },
  ])('$cas', ({ base, retraits, attendu }) => {
    expect(soustraire(base, retraits)).toEqual(attendu);
  });
});

describe('intersecter', () => {
  it.each([
    { a: [i(0, 10)], b: [i(5, 15)], attendu: [i(5, 10)] },
    { a: [i(0, 10)], b: [i(10, 15)], attendu: [] },
    { a: [i(0, 10), i(20, 30)], b: [i(5, 25)], attendu: [i(5, 10), i(20, 25)] },
  ])('$a ∩ $b', ({ a, b, attendu }) => {
    expect(intersecter(a, b)).toEqual(attendu);
  });
});

describe('contient', () => {
  it.each([
    { plages: [i(0, 10)], intervalle: i(0, 10), attendu: true },
    { plages: [i(0, 10)], intervalle: i(5, 11), attendu: false },
    { plages: [i(0, 5), i(5, 10)], intervalle: i(3, 7), attendu: true },
    { plages: [i(0, 5), i(6, 10)], intervalle: i(3, 7), attendu: false },
    { plages: [], intervalle: i(0, 1), attendu: false },
  ])('$intervalle dans $plages', ({ plages, intervalle, attendu }) => {
    expect(contient(plages, intervalle)).toBe(attendu);
  });
});
