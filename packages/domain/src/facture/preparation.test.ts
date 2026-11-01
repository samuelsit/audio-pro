import { describe, expect, it } from 'vitest';

import type { CodeLppCandidat } from '../audio-rules/code-lpp';
import type { TarifsAudio } from '../audio-rules/tarifs';
import { centimes } from '../money';
import {
  preparerFacture,
  repartirAmc,
  type AideAPreparer,
  type ConsommableAPreparer,
  type EntreePreparation,
} from './preparation';
import type { TauxTvaDate } from './tva';

const TARIFS: TarifsAudio = {
  VINGT_ET_PLUS: {
    baseRemboursement: centimes(40_000),
    prixLimiteClasseI: centimes(95_000),
  },
  MOINS_DE_20: {
    baseRemboursement: centimes(140_000),
    prixLimiteClasseI: centimes(140_000),
  },
};

const TAUX_TVA: readonly TauxTvaDate[] = [
  { type: 'AIDE_AUDITIVE', taux: 550, debut: '2021-01-01' },
  { type: 'PILE', taux: 2000, debut: '2021-01-01' },
  { type: 'ACCESSOIRE', taux: 2000, debut: '2021-01-01' },
  { type: 'ENTRETIEN', taux: 2000, debut: '2021-01-01' },
];

const ADULTE = '1960-05-12';
const MOINS_DE_20 = '2010-05-12';
const DELIVRANCE = '2026-10-31';

function aide(surcharge: Partial<AideAPreparer> = {}): AideAPreparer {
  return {
    oreille: 'DROITE',
    classe: 'CLASSE_I',
    libelle: 'Aurore Essentiel',
    prixTTC: centimes(95_000),
    numeroSerie: 'SN-1',
    appareilId: 'appareil-1',
    candidatsLpp: [],
    ...surcharge,
  };
}

function entree(surcharge: Partial<EntreePreparation> = {}): EntreePreparation {
  return {
    dateNaissance: ADULTE,
    dateDelivrance: DELIVRANCE,
    c2s: false,
    surdicecite: false,
    tauxAMO: 60,
    aides: [aide()],
    consommables: [],
    montantAccorde: null,
    tarifs: TARIFS,
    tauxTva: TAUX_TVA,
    ...surcharge,
  };
}

describe('TVA par ligne', () => {
  it('déduit le HT du TTC au taux de la date, par nature', () => {
    const { lignes, totaux } = preparerFacture(
      entree({
        consommables: [
          {
            nature: 'ENTRETIEN',
            libelle: 'Nettoyage',
            quantite: 1,
            prixUnitaire: centimes(1_200),
            codeLpp: null,
            accessoireId: null,
            tarif: null,
          },
        ],
      }),
    );
    expect(lignes.map((l) => [l.tauxTva, l.montantHT, l.montantTva])).toEqual([
      [550, 90_047, 4_953],
      [2000, 1_000, 200],
    ]);
    expect(totaux).toMatchObject({ ht: 91_047, tva: 5_153, prixTTC: 96_200 });
  });

  it('laisse le taux vide sans vigueur à la date : le contrôle bloquera', () => {
    const [ligne] = preparerFacture(entree({ tauxTva: [] })).lignes;
    expect(ligne).toMatchObject({ tauxTva: null, montantHT: 95_000, montantTva: 0 });
  });

  it('une ligne d’entretien n’a ni code prestation ni base', () => {
    const contenu = preparerFacture(
      entree({
        aides: [],
        consommables: [
          {
            nature: 'ENTRETIEN',
            libelle: 'Nettoyage',
            quantite: 2,
            prixUnitaire: centimes(600),
            codeLpp: null,
            accessoireId: null,
            tarif: null,
          },
        ],
      }),
    );
    expect(contenu.lignes[0]).toMatchObject({
      codePrestation: null,
      codeLppGenerique: false,
      baseRemboursement: 0,
      amo: 0,
      resteACharge: 1_200,
    });
  });
});

const parts = (e: EntreePreparation) =>
  preparerFacture(e).lignes.map((l) => [l.prixTTC, l.amo, l.amc, l.resteACharge]);

describe('ventilation de la facture préparée', () => {
  it.each([
    {
      cas: 'adulte classe I, sans complémentaire (FR 201 n° 6)',
      e: entree(),
      attendu: [95_000, 24_000, 0, 71_000],
    },
    {
      cas: 'adulte classe I, PEC du reste',
      e: entree({ montantAccorde: centimes(71_000) }),
      attendu: [95_000, 24_000, 71_000, 0],
    },
    {
      cas: 'adulte classe II, PEC partielle',
      e: entree({
        aides: [aide({ classe: 'CLASSE_II', prixTTC: centimes(150_000) })],
        montantAccorde: centimes(50_000),
      }),
      attendu: [150_000, 24_000, 50_000, 76_000],
    },
    {
      cas: 'moins de 20 ans, classe I au prix limite',
      e: entree({ dateNaissance: MOINS_DE_20, aides: [aide({ prixTTC: centimes(140_000) })] }),
      attendu: [140_000, 84_000, 0, 56_000],
    },
    {
      cas: 'moins de 20 ans, classe II (FR 201 n° 7)',
      e: entree({
        dateNaissance: MOINS_DE_20,
        aides: [aide({ classe: 'CLASSE_II', prixTTC: centimes(150_000) })],
      }),
      attendu: [150_000, 84_000, 0, 66_000],
    },
    {
      cas: 'C2S adulte, classe I au prix maximal',
      e: entree({ c2s: true, aides: [aide({ prixTTC: centimes(80_000) })] }),
      attendu: [80_000, 24_000, 56_000, 0],
    },
    {
      cas: 'C2S moins de 20 ans, refus de l’offre (FR 201 n° 5 et 10)',
      e: entree({
        c2s: true,
        dateNaissance: MOINS_DE_20,
        aides: [aide({ classe: 'CLASSE_II', prixTTC: centimes(150_000) })],
      }),
      attendu: [150_000, 84_000, 56_000, 10_000],
    },
    {
      cas: 'C2S adulte, refus de l’offre',
      e: entree({
        c2s: true,
        aides: [aide({ classe: 'CLASSE_II', prixTTC: centimes(150_000) })],
      }),
      attendu: [150_000, 24_000, 56_000, 70_000],
    },
    {
      cas: 'C2S adulte, personne sourde et aveugle : plafond de 1 400 €',
      e: entree({ c2s: true, surdicecite: true, aides: [aide({ prixTTC: centimes(140_000) })] }),
      attendu: [140_000, 24_000, 116_000, 0],
    },
    {
      cas: 'une PEC ne remplace pas la part C2S',
      e: entree({
        c2s: true,
        aides: [aide({ prixTTC: centimes(80_000) })],
        montantAccorde: centimes(1_000),
      }),
      attendu: [80_000, 24_000, 56_000, 0],
    },
    {
      cas: 'prix inférieur à la base (R13)',
      e: entree({
        dateNaissance: MOINS_DE_20,
        aides: [aide({ classe: 'CLASSE_II', prixTTC: centimes(100_000) })],
      }),
      attendu: [100_000, 60_000, 0, 40_000],
    },
  ])('$cas', ({ e, attendu }) => {
    expect(parts(e)).toEqual([attendu]);
  });

  it('lit l’âge à la délivrance : 20 ans atteints, la base tombe à 400 €', () => {
    const veille = entree({ dateNaissance: '2006-10-31', dateDelivrance: '2026-10-30' });
    const jourMeme = entree({ dateNaissance: '2006-10-31', dateDelivrance: '2026-10-31' });
    expect(preparerFacture(veille).lignes[0]?.baseRemboursement).toBe(140_000);
    expect(preparerFacture(jourMeme).lignes[0]?.baseRemboursement).toBe(40_000);
  });

  it('additionne les deux oreilles, droite d’abord', () => {
    const facture = preparerFacture(
      entree({
        aides: [aide({ oreille: 'GAUCHE', numeroSerie: 'SN-G' }), aide({ numeroSerie: 'SN-D' })],
        montantAccorde: centimes(100_001),
      }),
    );
    expect(facture.lignes.map((l) => [l.codePrestation, l.numeroSerie])).toEqual([
      ['P1D', 'SN-D'],
      ['P1G', 'SN-G'],
    ]);
    expect(facture.lignes.map((l) => l.amc)).toEqual([50_000, 50_001]);
    expect(facture.totaux).toEqual({
      prixTTC: 190_000,
      ht: 180_094,
      tva: 9_906,
      amo: 48_000,
      amc: 100_001,
      resteACharge: 41_999,
    });
    expect(facture.amcNonAffectee).toBe(0);
  });

  it('écrête la PEC à ce qui reste après l’AMO et garde la trace de l’excédent', () => {
    const facture = preparerFacture(entree({ montantAccorde: centimes(80_000) }));
    expect(facture.totaux).toMatchObject({ amc: 71_000, resteACharge: 0 });
    expect(facture.amcNonAffectee).toBe(9_000);
  });

  it('ne compte aucun excédent pour la C2S', () => {
    const e = entree({
      c2s: true,
      aides: [aide({ prixTTC: centimes(80_000) })],
      montantAccorde: centimes(90_000),
    });
    expect(preparerFacture(e).amcNonAffectee).toBe(0);
  });
});

describe('codes de la facture préparée', () => {
  const specifique = (code: string, nature: string, base: number): CodeLppCandidat => ({
    code,
    naturePrestation: nature,
    baseRemboursement: centimes(base),
  });
  const code = (e: EntreePreparation) => preparerFacture(e).lignes[0];

  it('préfère le code spécifique du modèle', () => {
    const candidatsLpp = [specifique('7310442', 'P1D', 40_000)];
    expect(code(entree({ aides: [aide({ candidatsLpp })] }))).toMatchObject({
      codeLpp: '7310442',
      codeLppGenerique: false,
    });
  });

  it('prend le code générique de classe II pour un appareil de classe I en C2S', () => {
    const candidatsLpp = [specifique('7310442', 'P1D', 40_000)];
    const e = entree({ c2s: true, aides: [aide({ candidatsLpp, prixTTC: centimes(80_000) })] });
    expect(code(e)).toMatchObject({
      codePrestation: 'P2D',
      codeLpp: '2392530',
      codeLppGenerique: true,
    });
  });
});

describe('piles et accessoires', () => {
  const pile = (surcharge: Partial<ConsommableAPreparer> = {}): ConsommableAPreparer => ({
    nature: 'PILE',
    libelle: 'Piles 312',
    quantite: 2,
    prixUnitaire: centimes(150),
    codeLpp: '7000001',
    accessoireId: 'accessoire-1',
    tarif: { baseRemboursement: centimes(150), naturePrestation: 'PIL' },
    ...surcharge,
  });
  const ligne = (e: EntreePreparation) => preparerFacture(e).lignes.at(-1);

  it('multiplie prix et base par la quantité, code PIL', () => {
    expect(ligne(entree({ consommables: [pile()] }))).toMatchObject({
      nature: 'PILE',
      oreille: null,
      classe: null,
      numeroSerie: null,
      codePrestation: 'PIL',
      codeLppGenerique: false,
      prixTTC: 300,
      baseRemboursement: 300,
      amo: 180,
      amc: 0,
      resteACharge: 120,
    });
  });

  it('code APA pour un accessoire, sans remboursement faute de tarif', () => {
    const accessoire = pile({ nature: 'ACCESSOIRE', codeLpp: null, tarif: null, quantite: 1 });
    expect(ligne(entree({ consommables: [accessoire] }))).toMatchObject({
      codePrestation: 'APA',
      baseRemboursement: 0,
      amo: 0,
      resteACharge: 150,
    });
  });

  it('signale un code de nature RJT', () => {
    const tarif = { baseRemboursement: centimes(150), naturePrestation: 'RJT' };
    expect(ligne(entree({ consommables: [pile({ tarif })] }))?.codeLppGenerique).toBe(true);
  });

  it('prend le tarif en charge à 100 % pour la C2S, jamais au-delà', () => {
    const e = entree({
      c2s: true,
      aides: [aide({ prixTTC: centimes(80_000) })],
      consommables: [pile({ prixUnitaire: centimes(200) })],
    });
    expect(ligne(e)).toMatchObject({ prixTTC: 400, amo: 180, amc: 120, resteACharge: 100 });
  });

  it('répartit la PEC sur toutes les lignes', () => {
    const facture = preparerFacture(
      entree({ consommables: [pile()], montantAccorde: centimes(71_120) }),
    );
    expect(facture.totaux).toMatchObject({ amc: 71_120, resteACharge: 0 });
  });
});

describe('repartirAmc', () => {
  it.each([
    { cas: 'proportionnel', montant: 1_000, restes: [1_000, 3_000], attendu: [250, 750] },
    { cas: 'sur un seul reste', montant: 500, restes: [71_000], attendu: [500] },
    { cas: 'arrondi cumulé', montant: 100, restes: [100, 100, 100], attendu: [33, 33, 34] },
    { cas: 'montant supérieur aux restes', montant: 900, restes: [100, 200], attendu: [100, 200] },
    { cas: 'ligne sans reste', montant: 100, restes: [0, 300], attendu: [0, 100] },
    { cas: 'dernière ligne sans reste', montant: 101, restes: [300, 0], attendu: [101, 0] },
    { cas: 'aucun reste', montant: 100, restes: [0, 0], attendu: [0, 0] },
    { cas: 'montant nul', montant: 0, restes: [100], attendu: [0] },
  ])('$cas', ({ montant, restes, attendu }) => {
    expect(repartirAmc(centimes(montant), restes.map(centimes))).toEqual(attendu);
  });
});
