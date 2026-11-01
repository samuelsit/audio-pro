import { describe, expect, it } from 'vitest';

import type { Hacheur } from '../ports/hacheur';
import {
  chargeComptage,
  chargeOuverture,
  comptageSaisieSchema,
  ecartDeCaisse,
  especesTheoriques,
  fondAttendu,
  justificationManquante,
  ouvertureSaisieSchema,
} from './session';

const HACHEUR: Hacheur = { sha256: (texte) => `h(${texte})` };

describe('saisies de caisse', () => {
  it('lit un fond, zéro compris', () => {
    expect(ouvertureSaisieSchema.parse({ fond: '0', justification: '' })).toEqual({
      fondCentimes: 0,
      justification: null,
    });
  });

  it('refuse un fond illisible', () => {
    expect(ouvertureSaisieSchema.safeParse({ fond: 'x', justification: '' }).success).toBe(false);
  });

  it('lit un comptage, remise absente', () => {
    expect(
      comptageSaisieSchema.parse({ comptees: '100', remiseBanque: '', justification: 'Écart' }),
    ).toEqual({ compteesCentimes: 10_000, remiseCentimes: 0, justification: 'Écart' });
  });

  it('refuse une remise supérieure aux espèces', () => {
    expect(
      comptageSaisieSchema.safeParse({ comptees: '10', remiseBanque: '20', justification: '' })
        .success,
    ).toBe(false);
  });
});

describe('calculs de caisse', () => {
  it('ajoute au fond les espèces nettes', () => {
    expect(
      especesTheoriques(5_000, [
        { nature: 'ENCAISSEMENT', montantCentimes: 2_000 },
        { nature: 'REMBOURSEMENT', montantCentimes: 500 },
      ]),
    ).toBe(6_500);
  });

  it.each([
    [10_000, 10_000, 0],
    [10_000, 9_500, -500],
    [10_000, 10_300, 300],
  ])('théorique %i, compté %i : écart %i', (theorique, comptees, ecart) => {
    expect(ecartDeCaisse(theorique, comptees)).toBe(ecart);
  });

  it.each([
    [0, null, false],
    [-500, null, true],
    [-500, 'Erreur de rendu', false],
  ])('écart %i, justification %s', (ecart, justification, manquante) => {
    expect(justificationManquante(ecart, justification)).toBe(manquante);
  });

  it('attend le comptage moins la remise, zéro au premier jour', () => {
    expect(fondAttendu({ compteesCentimes: 30_000, remiseCentimes: 25_000 })).toBe(5_000);
    expect(fondAttendu(null)).toBe(0);
  });
});

describe('charges', () => {
  it('ne gardent de la justification que son empreinte', () => {
    expect(
      chargeOuverture(
        {
          id: 's1',
          journee: '2026-11-02',
          fondCentimes: 100,
          fondAttenduCentimes: 200,
          justification: 'Remise',
        },
        HACHEUR,
      ),
    ).toEqual({
      id: 's1',
      journee: '2026-11-02',
      fondCentimes: 100,
      fondAttenduCentimes: 200,
      justificationEmpreinte: 'h(Remise)',
    });
    expect(
      chargeComptage(
        {
          id: 'c1',
          sessionId: 's1',
          journee: '2026-11-02',
          compteesCentimes: 100,
          theoriqueCentimes: 200,
          ecartCentimes: -100,
          remiseCentimes: 0,
          justification: null,
        },
        HACHEUR,
      ),
    ).toMatchObject({ ecartCentimes: -100, justificationEmpreinte: null });
  });
});
