import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import type { Hacheur } from '../ports/hacheur';
import {
  chargePiece,
  EMPREINTE_INITIALE,
  enchainer,
  serialiserCanonique,
  verifierChaine,
  type Maillon,
  type PieceAChainer,
} from './chaine';

/** Hachage de test, sans `node:crypto` : réversible pour rendre les comparaisons lisibles. */
const HACHEUR: Hacheur = { sha256: (texte) => `h(${texte})` };

function chaine(charges: readonly unknown[]): Maillon[] {
  const maillons: Maillon[] = [];
  charges.forEach((charge, index) => {
    const base = {
      rang: index + 1,
      type: 'FACTURE_VALIDEE',
      charge,
      empreintePrecedente: maillons.at(-1)?.empreinte ?? EMPREINTE_INITIALE,
    } as const;
    maillons.push({ ...base, empreinte: enchainer(base, HACHEUR) });
  });
  return maillons;
}

describe('serialiserCanonique', () => {
  it('ne dépend pas de l’ordre des clés', () => {
    expect(serialiserCanonique({ b: 1, a: { d: [1, null], c: 'x' } })).toBe(
      serialiserCanonique({ a: { c: 'x', d: [1, null] }, b: 1 }),
    );
  });

  it('écrit un JSON stable et ignore les champs absents', () => {
    expect(serialiserCanonique({ b: true, a: undefined, c: 'é' })).toBe('{"b":true,"c":"é"}');
  });
});

describe('verifierChaine', () => {
  const maillons = chaine(['a', 'b', 'c']);

  it('accepte une chaîne intacte, et une chaîne vide', () => {
    expect(verifierChaine(maillons, HACHEUR)).toEqual({ valide: true, maillons: 3 });
    expect(verifierChaine([], HACHEUR)).toEqual({ valide: true, maillons: 0 });
  });

  it.each([
    {
      cas: 'charge modifiée',
      altere: (m: Maillon[]) => m.with(1, { ...(m[1] as Maillon), charge: 'B' }),
      rang: 2,
    },
    {
      cas: 'empreinte recalculée sans suivre la chaîne',
      altere: (m: Maillon[]) => {
        const modifie = { ...(m[0] as Maillon), charge: 'A' };
        return m.with(0, { ...modifie, empreinte: enchainer(modifie, HACHEUR) });
      },
      rang: 2,
    },
    { cas: 'maillon supprimé', altere: (m: Maillon[]) => m.toSpliced(1, 1), rang: 2 },
    { cas: 'maillons inversés', altere: (m: Maillon[]) => [...m].reverse(), rang: 1 },
  ])('détecte : $cas', ({ altere, rang }) => {
    expect(verifierChaine(altere(maillons), HACHEUR)).toEqual({ valide: false, rang });
  });
});

describe('chargePiece', () => {
  const ligne = {
    nature: 'AIDE_AUDITIVE',
    codeLpp: '7310442',
    codePrestation: 'P1D',
    numeroSerie: 'SN-1',
    quantite: 1,
    prixTTC: centimes(95_000),
    tauxTva: 550,
    montantHT: centimes(90_047),
    montantTva: centimes(4_953),
    amo: centimes(24_000),
    amc: centimes(0),
    resteACharge: centimes(71_000),
  };
  const piece: PieceAChainer = {
    id: 'f1',
    nature: 'FACTURE',
    numero: 'FA-000001',
    numeroSequence: 1,
    dateFacture: '2026-11-01',
    patientId: 'p1',
    dossierId: 'd1',
    factureOrigineId: null,
    totaux: {
      prixTTC: centimes(95_000),
      ht: centimes(90_047),
      tva: centimes(4_953),
      amo: centimes(24_000),
      amc: centimes(0),
      resteACharge: centimes(71_000),
    },
    lignes: [ligne],
  };

  it('écarte ce qui n’est pas probant sur une ligne', () => {
    const avecIdentifiant = { ...piece, lignes: [{ ...ligne, id: 'l1', libre: 'x' }] };
    expect(serialiserCanonique(chargePiece(avecIdentifiant))).toBe(
      serialiserCanonique(chargePiece(piece)),
    );
  });

  it('change avec un montant', () => {
    const modifiee = { ...piece, lignes: [{ ...ligne, amo: centimes(1) }] };
    expect(serialiserCanonique(chargePiece(modifiee))).not.toBe(
      serialiserCanonique(chargePiece(piece)),
    );
  });
});
