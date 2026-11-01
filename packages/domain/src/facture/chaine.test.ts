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
    expect(verifierChaine(altere(maillons), HACHEUR)).toEqual({
      valide: false,
      rang,
      raison: 'MAILLON',
    });
  });
});

describe('maillon de format 2', () => {
  const contenu = {
    format: 2,
    rang: 1,
    type: 'ENCAISSEMENT',
    charge: { montant: 100 },
    empreintePrecedente: EMPREINTE_INITIALE,
    centreId: 'c1',
    acteurId: 'u1',
    horodatage: '2026-11-02T09:15:00.000Z',
  } as const;

  it('fige son format canonique : le changer impose une version majeure (BOFiP § 340)', () => {
    expect(enchainer(contenu, HACHEUR)).toBe(
      `h({"acteurId":"u1","centreId":"c1","charge":{"montant":100},"empreintePrecedente":"${EMPREINTE_INITIALE}","format":2,"horodatage":"2026-11-02T09:15:00.000Z","rang":1,"type":"ENCAISSEMENT"})`,
    );
  });

  it.each([
    ['horodatage', { horodatage: '2026-11-02T09:16:00.000Z' }],
    ['acteur', { acteurId: 'u2' }],
    ['centre', { centreId: 'c2' }],
  ])('change avec : %s', (_, modification) => {
    expect(enchainer({ ...contenu, ...modification }, HACHEUR)).not.toBe(
      enchainer(contenu, HACHEUR),
    );
  });

  it('un retour au format 1 change l’empreinte', () => {
    const { rang, type, charge, empreintePrecedente } = contenu;
    expect(enchainer({ rang, type, charge, empreintePrecedente }, HACHEUR)).not.toBe(
      enchainer(contenu, HACHEUR),
    );
  });

  it('se vérifie dans une chaîne, à la suite d’un maillon de format 1', () => {
    const [premier] = chaine(['A']) as [Maillon];
    const suite = { ...contenu, rang: 2, empreintePrecedente: premier.empreinte };
    expect(
      verifierChaine([premier, { ...suite, empreinte: enchainer(suite, HACHEUR) }], HACHEUR),
    ).toEqual({ valide: true, maillons: 2 });
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

  it('n’ajoute le tiers payant que s’il est refusé', () => {
    const sans = serialiserCanonique(chargePiece(piece));
    expect(serialiserCanonique(chargePiece({ ...piece, tiersPayantAmo: true }))).toBe(sans);
    expect(serialiserCanonique(chargePiece({ ...piece, tiersPayantAmo: false }))).toContain(
      '"tiersPayantAmo":false',
    );
  });

  it('n’ajoute les acomptes déduits que s’ils existent', () => {
    expect(serialiserCanonique(chargePiece({ ...piece, acomptesDeduits: centimes(0) }))).toBe(
      serialiserCanonique(chargePiece(piece)),
    );
    expect(serialiserCanonique(chargePiece({ ...piece, acomptesDeduits: centimes(5) }))).toContain(
      '"acomptesDeduits":5',
    );
  });

  it('change avec un montant', () => {
    const modifiee = { ...piece, lignes: [{ ...ligne, amo: centimes(1) }] };
    expect(serialiserCanonique(chargePiece(modifiee))).not.toBe(
      serialiserCanonique(chargePiece(piece)),
    );
  });
});
