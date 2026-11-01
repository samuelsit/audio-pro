import { describe, expect, it } from 'vitest';

import {
  proposerLigneCommande,
  rapprocher,
  type LigneCommandeARapprocher,
  type LigneFactureARapprocher,
} from './rapprochement';

const appareil: LigneCommandeARapprocher = {
  id: 'cl1',
  commandeId: 'c1',
  reference: 'AU-1',
  suiviAuNumero: true,
  quantiteRecue: 2,
  quantiteFacturee: 0,
  prixAchatCentimes: 60_000,
  numerosRecus: ['SN1', 'SN2'],
  numerosDejaFactures: [],
};

const ligne: LigneFactureARapprocher = {
  id: 'fl1',
  commandeLigneId: 'cl1',
  quantite: 2,
  prixUnitaireCentimes: 60_000,
  numerosSerie: ['SN1', 'SN2'],
};

const totaux = {
  montantHtCentimes: 120_000,
  montantTvaCentimes: 24_000,
  montantTtcCentimes: 144_000,
};

function types(...args: Parameters<typeof rapprocher>) {
  return rapprocher(...args).map((e) => e.type);
}

describe('rapprocher', () => {
  it('une facture conforme ne soulève aucun écart', () => {
    expect(rapprocher([ligne], [appareil], totaux, 0)).toEqual([]);
  });

  describe('écart de prix', () => {
    const chere = { ...ligne, prixUnitaireCentimes: 61_000 };
    const totauxChers = {
      montantHtCentimes: 122_000,
      montantTvaCentimes: 24_400,
      montantTtcCentimes: 146_400,
    };

    it('le signale, avec le prix attendu et le prix facturé', () => {
      expect(rapprocher([chere], [appareil], totauxChers, 0)).toEqual([
        expect.objectContaining({
          type: 'PRIX',
          factureLigneId: 'fl1',
          commandeLigneId: 'cl1',
          commandeId: 'c1',
          montantAttenduCentimes: 60_000,
          montantConstateCentimes: 61_000,
        }),
      ]);
    });

    it.each([
      ['à la tolérance : accepté', 1_000, []],
      ['juste au-delà : signalé', 999, ['PRIX']],
    ])('%s', (_, tolerance, attendu) => {
      expect(types([chere], [appareil], totauxChers, tolerance)).toEqual(attendu);
    });

    it('un prix facturé plus bas est aussi un écart', () => {
      const moins = { ...ligne, prixUnitaireCentimes: 59_000 };
      expect(
        types(
          [moins],
          [appareil],
          {
            montantHtCentimes: 118_000,
            montantTvaCentimes: 23_600,
            montantTtcCentimes: 141_600,
          },
          0,
        ),
      ).toEqual(['PRIX']);
    });

    it('sans prix de commande, rien à comparer', () => {
      expect(types([chere], [{ ...appareil, prixAchatCentimes: null }], totauxChers, 0)).toEqual(
        [],
      );
    });
  });

  describe('écart de quantité', () => {
    it('facturé plus que reçu', () => {
      const recue = { ...appareil, quantiteRecue: 1, numerosRecus: ['SN1'] };
      const unSeul = { ...ligne, numerosSerie: ['SN1', 'SN2'] };
      expect(rapprocher([unSeul], [recue], totaux, 0)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'QUANTITE_FACTUREE',
            commandeLigneId: 'cl1',
            quantiteAttendue: 1,
            quantiteConstatee: 2,
          }),
        ]),
      );
    });

    it('facture avant livraison : signalée, sans bloquer', () => {
      const attendue = { ...appareil, quantiteRecue: 0, numerosRecus: [] };
      expect(types([ligne], [attendue], totaux, 0)).toEqual([
        'SERIE_INCONNUE',
        'SERIE_INCONNUE',
        'QUANTITE_FACTUREE',
      ]);
    });

    it('cumule avec ce qui est déjà facturé', () => {
      const deja = { ...appareil, quantiteFacturee: 1 };
      expect(types([ligne], [deja], totaux, 0)).toEqual(['QUANTITE_FACTUREE']);
    });

    it('additionne deux lignes de la même facture', () => {
      const a = { ...ligne, id: 'a', quantite: 1, numerosSerie: ['SN1'] };
      const b = { ...ligne, id: 'b', quantite: 2, numerosSerie: ['SN2', 'SN1'] };
      expect(
        types(
          [a, b],
          [appareil],
          {
            montantHtCentimes: 180_000,
            montantTvaCentimes: 36_000,
            montantTtcCentimes: 216_000,
          },
          0,
        ),
      ).toEqual(['QUANTITE_FACTUREE']);
    });

    it('facture partielle : aucun écart', () => {
      const partielle = { ...ligne, quantite: 1, numerosSerie: ['SN1'] };
      expect(
        types(
          [partielle],
          [appareil],
          { montantHtCentimes: 60_000, montantTvaCentimes: 12_000, montantTtcCentimes: 72_000 },
          0,
        ),
      ).toEqual([]);
    });
  });

  describe('numéros de série', () => {
    it('inconnu, déjà facturé ou absent', () => {
      const commande = { ...appareil, numerosDejaFactures: ['SN2'] };
      const series = { ...ligne, numerosSerie: ['SN9', 'SN2'] };
      expect(rapprocher([series], [commande], totaux, 0)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'SERIE_INCONNUE', numeroSerie: 'SN9' }),
          expect.objectContaining({ type: 'SERIE_DEJA_FACTUREE', numeroSerie: 'SN2' }),
        ]),
      );
    });

    it('moins de numéros que d’appareils facturés', () => {
      expect(rapprocher([{ ...ligne, numerosSerie: ['SN1'] }], [appareil], totaux, 0)).toEqual([
        expect.objectContaining({
          type: 'SERIE_ABSENTE',
          quantiteAttendue: 2,
          quantiteConstatee: 1,
        }),
      ]);
    });

    it('un accessoire n’a pas de numéro', () => {
      const piles = {
        ...appareil,
        suiviAuNumero: false,
        numerosRecus: [],
        quantiteRecue: 2,
      };
      expect(types([{ ...ligne, numerosSerie: [] }], [piles], totaux, 0)).toEqual([]);
    });
  });

  describe('lignes et totaux', () => {
    it('une ligne sans commande est signalée, avec son montant', () => {
      const port = {
        id: 'port',
        commandeLigneId: null,
        quantite: 1,
        prixUnitaireCentimes: 1_500,
        numerosSerie: [],
      };
      expect(
        rapprocher(
          [port],
          [],
          { montantHtCentimes: 1_500, montantTvaCentimes: 300, montantTtcCentimes: 1_800 },
          0,
        ),
      ).toEqual([
        expect.objectContaining({
          type: 'LIGNE_NON_COMMANDEE',
          factureLigneId: 'port',
          montantConstateCentimes: 1_500,
        }),
      ]);
    });

    it('les lignes n’additionnent pas le total HT', () => {
      expect(
        rapprocher(
          [ligne],
          [appareil],
          { ...totaux, montantHtCentimes: 110_000, montantTtcCentimes: 134_000 },
          0,
        ),
      ).toEqual([
        expect.objectContaining({
          type: 'TOTAL_INCOHERENT',
          montantAttenduCentimes: 120_000,
          montantConstateCentimes: 110_000,
        }),
      ]);
    });

    it('HT + TVA ne donne pas le TTC', () => {
      expect(
        rapprocher([ligne], [appareil], { ...totaux, montantTtcCentimes: 150_000 }, 0),
      ).toEqual([
        expect.objectContaining({
          type: 'TOTAL_INCOHERENT',
          montantAttenduCentimes: 144_000,
          montantConstateCentimes: 150_000,
        }),
      ]);
    });
  });
});

describe('proposerLigneCommande', () => {
  const autre = { ...appareil, id: 'cl2', reference: 'AU-2', numerosRecus: ['SN7'] };

  it.each([
    ['par numéro de série reçu', { reference: 'AU-2', numerosSerie: ['SN1'] }, 'cl1'],
    ['par référence', { reference: 'AU-2', numerosSerie: [] }, 'cl2'],
    ['rien', { reference: null, numerosSerie: [] }, null],
    ['référence inconnue', { reference: 'XX', numerosSerie: [] }, null],
  ])('%s', (_, l, attendu) => {
    expect(proposerLigneCommande(l, [appareil, autre])).toBe(attendu);
  });

  it('une référence commandée deux fois reste à choisir', () => {
    const double = { ...appareil, id: 'cl3' };
    expect(
      proposerLigneCommande({ reference: 'AU-1', numerosSerie: [] }, [appareil, double]),
    ).toBeNull();
  });
});
