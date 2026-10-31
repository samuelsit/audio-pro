import { describe, expect, it } from 'vitest';

import { STATUTS_DOSSIER } from '../dossier/etats';
import { centimes } from '../money';
import type { OffreCalculee, PosteCalcule } from './calcul';
import { amcDepuisPec, dossierAcceptePec, pecDiffereDuDevis } from './pec';

function poste(resteApresAMO: number, amc: number | null = null): PosteCalcule {
  return {
    ht: centimes(0),
    htApresRemise: centimes(0),
    ttc: centimes(resteApresAMO),
    amo: centimes(0),
    amc: amc === null ? null : centimes(amc),
    resteACharge: null,
    resteApresAMO: centimes(resteApresAMO),
  };
}

function offre(droite: number | null, gauche: number | null, consommables: number | null) {
  const aide = (reste: number | null) =>
    reste === null ? null : { ...poste(reste), base: centimes(0), plafond: null };
  return {
    rubrique: 'OFFRE_100_SANTE',
    droite: aide(droite),
    gauche: aide(gauche),
    consommables: consommables === null ? null : poste(consommables),
    total: poste((droite ?? 0) + (gauche ?? 0) + (consommables ?? 0)),
  } as OffreCalculee;
}

describe('dossierAcceptePec', () => {
  it.each(STATUTS_DOSSIER)('%s', (statut) => {
    expect(dossierAcceptePec(statut)).toBe(
      !['BROUILLON', 'FACTURE', 'CLOS', 'ABANDONNE'].includes(statut),
    );
  });
});

describe('amcDepuisPec', () => {
  it.each([
    {
      cas: 'deux oreilles, au prorata',
      montant: 60000,
      offre: offre(100000, 50000, null),
      attendu: { amcDroite: 40000, amcGauche: 20000, amcConsommables: null },
    },
    {
      cas: 'une oreille et des consommables',
      montant: 10000,
      offre: offre(30000, null, 10000),
      attendu: { amcDroite: 7500, amcGauche: null, amcConsommables: 2500 },
    },
    {
      cas: 'plafonné au reste',
      montant: 90000,
      offre: offre(50000, null, null),
      attendu: { amcDroite: 50000, amcGauche: null, amcConsommables: null },
    },
    {
      cas: 'sans reste',
      montant: 5000,
      offre: offre(0, null, null),
      attendu: { amcDroite: 0, amcGauche: null, amcConsommables: null },
    },
  ])('$cas', ({ montant, offre: o, attendu }) => {
    expect(amcDepuisPec(centimes(montant), o)).toEqual(attendu);
  });
});

describe('pecDiffereDuDevis', () => {
  const avecAmc = (reste: number, amc: number | null) => ({
    ...offre(reste, null, null),
    total: poste(reste, amc),
  });

  it.each([
    { cas: 'part égale au montant', offres: [avecAmc(50000, 30000)], attendu: false },
    { cas: 'part plafonnée au reste', offres: [avecAmc(20000, 20000)], attendu: false },
    { cas: 'part différente', offres: [avecAmc(50000, 10000)], attendu: true },
    { cas: 'part inconnue', offres: [avecAmc(50000, null)], attendu: true },
    {
      cas: 'une offre sur deux',
      offres: [avecAmc(50000, 30000), avecAmc(50000, 0)],
      attendu: true,
    },
  ])('$cas', ({ offres, attendu }) => {
    expect(pecDiffereDuDevis(centimes(30000), offres)).toBe(attendu);
  });
});
