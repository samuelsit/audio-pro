import { describe, expect, it } from 'vitest';

import {
  codeGeneriqueDepuisOldCode,
  estTitreDeuxChapitreTrois,
  prixLimiteVenteDepuisPuReglemente,
  tarifEnVigueur,
} from './regles';

describe('estTitreDeuxChapitreTrois', () => {
  it.each([
    { arbo: [2, 3, 7, 0], attendu: true, cas: 'aide auditive' },
    { arbo: [2, 3, 6, 1], attendu: true, cas: 'ancienne liste nominative' },
    { arbo: [2, 2, 5, 0], attendu: false, cas: 'optique' },
    { arbo: [3, 4, 12, 0], attendu: false, cas: 'implant cochléaire (titre III)' },
    { arbo: [3, 2], attendu: false, cas: 'valeurs inversées' },
    { arbo: [], attendu: false, cas: 'arborescence vide' },
  ])('$cas', ({ arbo, attendu }) => {
    expect(estTitreDeuxChapitreTrois(arbo)).toBe(attendu);
  });
});

describe('prixLimiteVenteDepuisPuReglemente', () => {
  it.each([
    { pu: 95_000, attendu: 95_000, cas: 'classe I, 20 ans et plus' },
    { pu: 140_000, attendu: 140_000, cas: 'classe I, moins de 20 ans' },
    { pu: 0, attendu: null, cas: 'classe II, prix libre' },
    { pu: null, attendu: null, cas: 'champ vide' },
  ])('$cas', ({ pu, attendu }) => {
    expect(prixLimiteVenteDepuisPuReglemente(pu)).toBe(attendu);
  });
});

describe('codeGeneriqueDepuisOldCode', () => {
  const connus = new Set(['2351057', '7336200']);

  it.each([
    { code: '7336200', oldCode: '2351057', attendu: '2351057', cas: 'spécifique de ce générique' },
    { code: '7336200', oldCode: null, attendu: null, cas: 'sans OLD_CODE' },
    { code: '7336200', oldCode: '9999999', attendu: null, cas: 'parent absent de la base' },
    { code: '2344100', oldCode: '2351057', attendu: null, cas: 'code qui n’est pas un 7xxxxxx' },
    { code: '2344100', oldCode: '203C01', attendu: null, cas: 'ancien code TIPS' },
  ])('$cas', ({ code, oldCode, attendu }) => {
    expect(codeGeneriqueDepuisOldCode(code, oldCode, connus)).toBe(attendu);
  });
});

describe('tarifEnVigueur', () => {
  const lignes = [
    { debutValidite: '2023-11-27', finValidite: '2026-07-02', tarif: 379_681 },
    { debutValidite: '2026-07-03', finValidite: null, tarif: 371_964 },
  ];

  it.each([
    { date: '2023-11-26', attendu: null, cas: 'avant le premier tarif' },
    { date: '2023-11-27', attendu: 379_681, cas: 'premier jour, inclus' },
    { date: '2026-07-02', attendu: 379_681, cas: 'dernier jour, inclus' },
    { date: '2026-07-03', attendu: 371_964, cas: 'jour du changement' },
    { date: '2030-01-01', attendu: 371_964, cas: 'ligne ouverte' },
  ])('$cas', ({ date, attendu }) => {
    expect(tarifEnVigueur(lignes, null, date)?.tarif ?? null).toBe(attendu);
  });

  it.each([
    { date: '2004-09-22', attendu: 78_313, cas: 'dernier jour de la fiche, inclus' },
    { date: '2004-09-23', attendu: null, cas: 'la fin de fiche ferme la ligne ouverte' },
  ])('$cas', ({ date, attendu }) => {
    const ouverte = [{ debutValidite: '2003-09-08', finValidite: null, tarif: 78_313 }];
    expect(tarifEnVigueur(ouverte, '2004-09-22', date)?.tarif ?? null).toBe(attendu);
  });

  it('ne retient pas une ligne dont l’effet est à venir', () => {
    const avenir = [{ debutValidite: '2026-11-01', finValidite: null, tarif: 100 }];
    expect(tarifEnVigueur(avenir, null, '2026-10-30')).toBeNull();
  });
});
