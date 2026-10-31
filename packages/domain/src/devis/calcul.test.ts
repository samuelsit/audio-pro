import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import {
  calculerDevis,
  devisCalculeSchema,
  finGarantieMinimale,
  prixHT,
  type ContexteCalcul,
} from './calcul';
import {
  AIDE_CLASSE_II,
  aide,
  offre,
  piles,
  TARIFS,
  TARIFS_CONSOMMABLES,
} from './fixtures.test-support';
import type { OffreDonnees } from './types';

const ADULTE: ContexteCalcul = {
  dateNaissance: '1950-03-12',
  dateDelivrancePrevue: '2026-12-01',
  c2s: false,
  refusOffreC2S: false,
  surdicecite: false,
  tauxAMO: 60,
};
const MOINS_DE_20 = { ...ADULTE, dateNaissance: '2010-03-12' };
const C2S = { ...ADULTE, c2s: true };

function calcul(donnees: OffreDonnees, contexte: ContexteCalcul = ADULTE) {
  const [resultat] = calculerDevis([donnees], contexte, TARIFS, TARIFS_CONSOMMABLES).offres;
  if (resultat === undefined) {
    throw new Error('Offre absente.');
  }
  return resultat;
}

describe('prixHT', () => {
  it.each([
    { cas: 'prix limite à 5,5 %', ttc: 95_000, taux: 550, ht: 90_047 },
    { cas: 'consommable à 20 %', ttc: 600, taux: 2000, ht: 500 },
    { cas: 'arrondi au centime', ttc: 150, taux: 550, ht: 142 },
    { cas: 'taux nul', ttc: 95_000, taux: 0, ht: 95_000 },
    { cas: 'prix nul', ttc: 0, taux: 550, ht: 0 },
  ])('$cas', ({ ttc, taux, ht }) => {
    expect(prixHT(centimes(ttc), taux)).toBe(ht);
  });
});

describe('finGarantieMinimale', () => {
  it.each([
    { delivrance: '2026-12-01', fin: '2030-12-01' },
    { delivrance: '2024-02-29', fin: '2028-02-29' },
  ])('$delivrance → $fin', ({ delivrance, fin }) => {
    expect(finGarantieMinimale(delivrance)).toBe(fin);
  });
});

describe('calculerDevis : une aide', () => {
  it.each<{
    cas: string;
    contexte: ContexteCalcul;
    prix: number;
    amc: number | null;
    attendu: object;
  }>([
    {
      cas: 'adulte, classe I au prix limite',
      contexte: ADULTE,
      prix: 95_000,
      amc: 71_000,
      attendu: {
        base: 40_000,
        plafond: 95_000,
        amo: 24_000,
        amc: 71_000,
        resteACharge: 0,
        resteApresAMO: 71_000,
      },
    },
    {
      cas: 'moins de 20 ans, classe I',
      contexte: MOINS_DE_20,
      prix: 140_000,
      amc: 56_000,
      attendu: { base: 140_000, plafond: 140_000, amo: 84_000, amc: 56_000, resteACharge: 0 },
    },
    {
      cas: 'C2S adulte au plafond',
      contexte: C2S,
      prix: 80_000,
      amc: 56_000,
      attendu: { base: 40_000, plafond: 80_000, amo: 24_000, amc: 56_000, resteACharge: 0 },
    },
    {
      cas: 'C2S moins de 20 ans au plafond',
      contexte: { ...MOINS_DE_20, c2s: true },
      prix: 140_000,
      amc: 56_000,
      attendu: { plafond: 140_000, amo: 84_000, amc: 56_000, resteACharge: 0 },
    },
    {
      cas: 'C2S, refus de l’offre : plafond général et dépassement à charge',
      contexte: { ...C2S, refusOffreC2S: true },
      prix: 95_000,
      amc: 56_000,
      attendu: { plafond: 95_000, amo: 24_000, amc: 56_000, resteACharge: 15_000 },
    },
    {
      cas: 'AMC supérieure au restant, écrêtée',
      contexte: ADULTE,
      prix: 95_000,
      amc: 99_000,
      attendu: { amo: 24_000, amc: 71_000, resteACharge: 0 },
    },
    {
      cas: 'AMC inconnue : ni part ni reste, reste après AMO seul',
      contexte: ADULTE,
      prix: 95_000,
      amc: null,
      attendu: { amo: 24_000, amc: null, resteACharge: null, resteApresAMO: 71_000 },
    },
    {
      cas: 'taux AMO de 100 %',
      contexte: { ...ADULTE, tauxAMO: 100 },
      prix: 95_000,
      amc: 0,
      attendu: { amo: 40_000, amc: 0, resteACharge: 55_000 },
    },
  ])('$cas', ({ contexte, prix, amc, attendu }) => {
    const resultat = calcul(
      offre({
        aides: [aide('DROITE', prix)],
        amcDroite: amc === null ? null : centimes(amc),
      }),
      contexte,
    );
    expect(resultat.droite).toMatchObject(attendu);
    expect(resultat.gauche).toBeNull();
  });

  it('classe II à prix libre : aucun plafond, base identique', () => {
    const resultat = calcul(
      offre({
        rubrique: 'AUTRE_OFFRE',
        aides: [aide('GAUCHE', 180_000, AIDE_CLASSE_II, 190_000)],
        amcGauche: centimes(50_000),
      }),
    );
    expect(resultat.gauche).toMatchObject({
      plafond: null,
      base: 40_000,
      ht: 180_095,
      htApresRemise: 170_616,
      ttc: 180_000,
      amo: 24_000,
      amc: 50_000,
      resteACharge: 106_000,
    });
  });

  it('classe II pour un moins de 20 ans : prix sous la base, AMO sur le prix (R13)', () => {
    const resultat = calcul(
      offre({ aides: [aide('DROITE', 100_000, AIDE_CLASSE_II)] }),
      MOINS_DE_20,
    );
    expect(resultat.droite).toMatchObject({ plafond: null, base: 140_000, amo: 60_000 });
  });
});

describe('calculerDevis : consommables', () => {
  it('AMO sur le tarif LPP, ligne par ligne, et quantité', () => {
    const resultat = calcul(
      offre({
        consommables: [piles(4), piles(1, null, 1_000)],
        amcConsommables: centimes(100),
      }),
    );
    expect(resultat.consommables).toEqual({
      ht: 1_333,
      htApresRemise: 1_333,
      ttc: 1_600,
      amo: 360,
      amc: 100,
      resteACharge: 1_140,
      resteApresAMO: 1_240,
    });
  });

  it('un code sans tarif en vigueur n’est pas remboursé', () => {
    const resultat = calcul(offre({ consommables: [piles(1, '9999999')] }));
    expect(resultat.consommables).toMatchObject({ amo: 0, amc: null, resteACharge: null });
  });

  it('AMC écrêtée à ce qui reste', () => {
    const resultat = calcul(offre({ consommables: [piles(1)], amcConsommables: centimes(9_999) }));
    expect(resultat.consommables).toMatchObject({ amo: 90, amc: 60, resteACharge: 0 });
  });

  it('pas de consommable : pas de poste', () => {
    expect(calcul(offre({ aides: [aide('DROITE', 95_000)] })).consommables).toBeNull();
  });
});

describe('calculerDevis : total de l’offre', () => {
  it('additionne les postes', () => {
    const resultat = calcul(
      offre({
        aides: [aide('DROITE', 95_000), aide('GAUCHE', 95_000)],
        consommables: [piles(4)],
        amcDroite: centimes(71_000),
        amcGauche: centimes(71_000),
        amcConsommables: centimes(240),
      }),
    );
    expect(resultat.total).toEqual({
      ht: 180_594,
      htApresRemise: 180_594,
      ttc: 190_600,
      amo: 48_360,
      amc: 142_240,
      resteACharge: 0,
      resteApresAMO: 142_240,
    });
  });

  it('une AMC connue sur un seul poste : les autres comptent pour zéro', () => {
    const resultat = calcul(
      offre({
        aides: [aide('DROITE', 95_000), aide('GAUCHE', 95_000)],
        amcDroite: centimes(71_000),
      }),
    );
    expect(resultat.total).toMatchObject({ amc: 71_000, resteACharge: 71_000 });
  });

  it('aucune AMC connue : ni total AMC ni reste', () => {
    const resultat = calcul(offre({ aides: [aide('DROITE', 95_000)] }));
    expect(resultat.total).toMatchObject({ amc: null, resteACharge: null, resteApresAMO: 71_000 });
  });
});

describe('calculerDevis : devis', () => {
  it('rend les deux offres, la délivrance prévue et la fin de garantie', () => {
    const resultat = calculerDevis(
      [
        offre({ aides: [aide('DROITE', 95_000)] }),
        offre({ rubrique: 'AUTRE_OFFRE', aides: [aide('DROITE', 180_000, AIDE_CLASSE_II)] }),
      ],
      ADULTE,
      TARIFS,
      TARIFS_CONSOMMABLES,
    );
    expect(resultat.offres.map((o) => o.rubrique)).toEqual(['OFFRE_100_SANTE', 'AUTRE_OFFRE']);
    expect(resultat.dateDelivrancePrevue).toBe('2026-12-01');
    expect(resultat.finGarantieMinimale).toBe('2030-12-01');
  });

  it('se relit après un passage en JSON', () => {
    const resultat = calculerDevis(
      [offre({ aides: [aide('DROITE', 95_000)], consommables: [piles()] })],
      ADULTE,
      TARIFS,
      TARIFS_CONSOMMABLES,
    );
    expect(devisCalculeSchema.parse(JSON.parse(JSON.stringify(resultat)))).toEqual(resultat);
  });
});
