import { describe, expect, it } from 'vitest';

import { centimes, type Centimes } from '../money';
import {
  avoirSaisieSchema,
  calculerAvoir,
  MONTANTS_NULS,
  reprisesTotales,
  totauxAvoir,
  type LigneAAvoir,
  type LigneAvoir,
  type MontantsLigne,
} from './avoir';

function ligne(id: string, dejaAvoir: MontantsLigne = MONTANTS_NULS): LigneAAvoir {
  return {
    id,
    nature: 'AIDE_AUDITIVE',
    oreille: 'DROITE',
    classe: 'CLASSE_I',
    libelle: 'Aurore',
    quantite: 1,
    codeLpp: '7310442',
    codeLppGenerique: false,
    codePrestation: 'P1D',
    numeroSerie: 'SN-1',
    prixUnitaire: centimes(95_000),
    prixTTC: centimes(95_000),
    tauxTva: 550,
    montantHT: centimes(90_047),
    montantTva: centimes(4_953),
    baseRemboursement: centimes(40_000),
    amo: centimes(24_000),
    amc: centimes(50_000),
    resteACharge: centimes(21_000),
    dejaAvoir,
  };
}

function accepte(lignes: readonly LigneAAvoir[], reprises: { ligneId: string; montant: number }[]) {
  const resultat = calculerAvoir(
    lignes,
    reprises.map((r) => ({ ...r, montant: r.montant as Centimes })),
  );
  if (!resultat.accepte) {
    throw new Error(resultat.code);
  }
  return resultat;
}

const parts = ({ prixTTC, amo, amc, resteACharge }: LigneAvoir) => [
  prixTTC,
  amo,
  amc,
  resteACharge,
];

describe('avoir partiel', () => {
  it('ventile au prorata, et la somme retombe sur le montant', () => {
    const { lignes, solde } = accepte([ligne('l1')], [{ ligneId: 'l1', montant: 47_500 }]);
    expect(lignes.map(parts)).toEqual([[47_500, 12_000, 25_000, 10_500]]);
    expect(lignes[0]).toMatchObject({
      ligneOrigineId: 'l1',
      montantHT: 45_024,
      montantTva: 2_476,
      baseRemboursement: 20_000,
      quantite: 1,
      prixUnitaire: 47_500,
      libelle: 'Reprise partielle : Aurore',
    });
    expect(solde).toBe(false);
  });

  it('une seule ligne reprise en entier ne solde pas une facture de deux lignes', () => {
    const { lignes, solde } = accepte(
      [ligne('l1'), ligne('l2')],
      [{ ligneId: 'l1', montant: 95_000 }],
    );
    expect(lignes[0]).toMatchObject({ libelle: 'Aurore', amo: 24_000 });
    expect(solde).toBe(false);
  });

  it('un montant qui ne tombe pas juste garde parts = TTC', () => {
    const { lignes } = accepte([ligne('l1')], [{ ligneId: 'l1', montant: 33_333 }]);
    const [avoir] = lignes as [LigneAvoir];
    expect(avoir.amo + avoir.amc + avoir.resteACharge).toBe(33_333);
    expect(avoir.montantHT + avoir.montantTva).toBe(33_333);
  });

  it('le solde d’une ligne reprise en plusieurs fois retombe exactement sur la facture', () => {
    const premier = accepte([ligne('l1')], [{ ligneId: 'l1', montant: 33_333 }]);
    const [avoir] = premier.lignes as [LigneAvoir];
    const second = accepte([ligne('l1', avoir)], [{ ligneId: 'l1', montant: 61_667 }]);
    const [fin] = second.lignes as [LigneAvoir];
    expect(second.solde).toBe(true);
    expect(fin.amo + avoir.amo).toBe(24_000);
    expect(fin.amc + avoir.amc).toBe(50_000);
    expect(fin.resteACharge + avoir.resteACharge).toBe(21_000);
    expect(fin.montantHT + avoir.montantHT).toBe(90_047);
    expect(fin.montantTva + avoir.montantTva).toBe(4_953);
    expect(fin.baseRemboursement + avoir.baseRemboursement).toBe(40_000);
  });
});

describe('avoir total', () => {
  const lignes = [ligne('l1'), ligne('l2')];

  it('reprend toutes les lignes à l’identique et solde la facture', () => {
    const resultat = accepte(lignes, reprisesTotales(lignes));
    expect(resultat.solde).toBe(true);
    expect(resultat.lignes[0]).toMatchObject({
      libelle: 'Aurore',
      prixTTC: 95_000,
      amo: 24_000,
      numeroSerie: 'SN-1',
    });
    expect(totauxAvoir(resultat.lignes)).toEqual({
      prixTTC: 190_000,
      ht: 180_094,
      tva: 9_906,
      amo: 48_000,
      amc: 100_000,
      resteACharge: 42_000,
    });
  });

  it('ne reprend que ce qui reste après un avoir partiel', () => {
    const partiel = accepte([ligne('l1')], [{ ligneId: 'l1', montant: 47_500 }]).lignes[0];
    const restantes = [ligne('l1', partiel)];
    expect(reprisesTotales(restantes)).toEqual([{ ligneId: 'l1', montant: 47_500 }]);
  });
});

describe('refus', () => {
  it.each([
    { cas: 'aucune reprise', reprises: [], code: 'AUCUNE_REPRISE' },
    {
      cas: 'montants à zéro',
      reprises: [{ ligneId: 'l1', montant: 0 }],
      code: 'AUCUNE_REPRISE',
    },
    { cas: 'ligne étrangère', reprises: [{ ligneId: 'x', montant: 1 }], code: 'LIGNE_INCONNUE' },
    {
      cas: 'plus que le prix',
      reprises: [{ ligneId: 'l1', montant: 95_001 }],
      code: 'MONTANT_EXCESSIF',
    },
  ])('$cas', ({ reprises, code }) => {
    const resultat = calculerAvoir(
      [ligne('l1')],
      reprises.map((r) => ({ ...r, montant: r.montant as Centimes })),
    );
    expect(resultat).toEqual({ accepte: false, code });
  });

  it('refuse de dépasser ce qui reste après un premier avoir', () => {
    const partiel = accepte([ligne('l1')], [{ ligneId: 'l1', montant: 60_000 }]).lignes[0];
    const resultat = calculerAvoir(
      [ligne('l1', partiel)],
      [{ ligneId: 'l1', montant: centimes(35_001) }],
    );
    expect(resultat).toEqual({ accepte: false, code: 'MONTANT_EXCESSIF' });
  });
});

describe('avoirSaisieSchema', () => {
  it('convertit les montants et traite le vide comme zéro', () => {
    const saisie = avoirSaisieSchema.parse({
      mode: 'PARTIEL',
      motif: ' Geste commercial ',
      reprises: [
        { ligneId: 'l1', montant: '120,50' },
        { ligneId: 'l2', montant: '' },
      ],
    });
    expect(saisie).toEqual({
      mode: 'PARTIEL',
      motif: 'Geste commercial',
      reprises: [
        { ligneId: 'l1', montant: 12_050 },
        { ligneId: 'l2', montant: 0 },
      ],
    });
  });

  it('exige un motif et des montants lisibles', () => {
    expect(avoirSaisieSchema.safeParse({ mode: 'TOTAL', motif: '' }).success).toBe(false);
    expect(
      avoirSaisieSchema.safeParse({
        mode: 'PARTIEL',
        motif: 'x',
        reprises: [{ ligneId: 'l1', montant: 'abc' }],
      }).success,
    ).toBe(false);
  });
});
