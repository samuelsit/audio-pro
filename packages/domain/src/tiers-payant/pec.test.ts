import { describe, expect, it } from 'vitest';

import { amcDepuisPec, pecDiffereDuDevis } from '../devis/pec';
import type { OffreCalculee } from '../devis/calcul';
import { preparerFacture, type EntreePreparation } from '../facture/preparation';
import type { StatutPec } from '../facture/saisie';
import { centimes } from '../money';
import { montantPecApplicable, pecAccordee, pecExpiree } from './pec';

const pec = (statut: StatutPec, montantAccordeCentimes: number | null, validiteFin?: string) => ({
  statut,
  montantAccordeCentimes,
  validiteFin: validiteFin ?? null,
});

describe('pecAccordee', () => {
  it.each([
    ['A_DEMANDER', false],
    ['DEMANDEE', false],
    ['ACCORDEE', true],
    ['PARTIELLE', true],
    ['REFUSEE', false],
    ['EXPIREE', false],
    ['SANS_TIERS_PAYANT', false],
  ] as const)('%s', (statut, attendu) => {
    expect(pecAccordee(statut)).toBe(attendu);
  });
});

describe('pecExpiree', () => {
  it.each([
    ['saisie expirée', pec('EXPIREE', null), true],
    ['accord sans date de fin', pec('ACCORDEE', 100), false],
    ['accord valide le dernier jour', pec('ACCORDEE', 100, '2026-11-02'), false],
    ['accord dépassé', pec('ACCORDEE', 100, '2026-11-01'), true],
    ['accord partiel dépassé', pec('PARTIELLE', 100, '2026-11-01'), true],
    ['refus avec une date passée', pec('REFUSEE', null, '2026-11-01'), false],
  ])('%s', (_, lue, attendu) => {
    expect(pecExpiree(lue, '2026-11-02')).toBe(attendu);
  });
});

describe('montantPecApplicable', () => {
  it.each([
    ['aucune PEC', null, null],
    ['à demander', pec('A_DEMANDER', null), null],
    ['demandée', pec('DEMANDEE', null), null],
    ['sans tiers payant', pec('SANS_TIERS_PAYANT', null), null],
    ['accordée', pec('ACCORDEE', 71_000), 71_000],
    ['accordée en partie', pec('PARTIELLE', 40_000), 40_000],
    ['accord sans montant', pec('ACCORDEE', null), null],
    ['refusée', pec('REFUSEE', null), 0],
    ['expirée', pec('EXPIREE', null), 0],
    ['accord dépassé', pec('ACCORDEE', 71_000, '2026-11-01'), 0],
  ])('%s', (_, lue, attendu) => {
    expect(montantPecApplicable(lue, '2026-11-02')).toBe(attendu);
  });
});

describe('effet d’un refus de PEC sur le reste à charge', () => {
  const TARIFS = {} as EntreePreparation['tarifs'];
  const entree = (montantAccorde: number | null): EntreePreparation => ({
    dateNaissance: '1960-05-12',
    dateDelivrance: '2026-11-02',
    c2s: false,
    surdicecite: false,
    tauxAMO: 60,
    aides: [],
    consommables: [
      {
        nature: 'ACCESSOIRE',
        libelle: 'Accessoire',
        quantite: 1,
        prixUnitaire: centimes(100_000),
        codeLpp: '7000000',
        accessoireId: null,
        tarif: { baseRemboursement: centimes(40_000), naturePrestation: 'APA' },
      },
    ],
    montantAccorde: montantAccorde === null ? null : centimes(montantAccorde),
    tarifs: TARIFS,
    tauxTva: [],
  });

  it.each([
    ['accord', pec('ACCORDEE', 30_000), { amc: 30_000, resteACharge: 46_000 }],
    ['accord partiel', pec('PARTIELLE', 10_000), { amc: 10_000, resteACharge: 66_000 }],
    ['refus', pec('REFUSEE', null), { amc: 0, resteACharge: 76_000 }],
    ['expiration', pec('ACCORDEE', 30_000, '2026-11-01'), { amc: 0, resteACharge: 76_000 }],
  ])('à la facture : %s', (_, lue, attendu) => {
    const montant = montantPecApplicable(lue, '2026-11-02');
    const { totaux } = preparerFacture(entree(montant));
    expect(totaux).toMatchObject({ amo: 24_000, ...attendu });
    expect(totaux.amo + totaux.amc + totaux.resteACharge).toBe(totaux.prixTTC);
  });

  const poste = (amc: number | null) =>
    ({ resteApresAMO: centimes(76_000), amc: amc === null ? null : centimes(amc) }) as never;
  const offre = (amc: number | null) =>
    ({
      droite: poste(amc),
      gauche: null,
      consommables: null,
      total: poste(amc),
    }) as unknown as OffreCalculee;

  it('sur un brouillon de devis, la part estimée tombe à zéro', () => {
    expect(amcDepuisPec(centimes(0), offre(30_000))).toEqual({
      amcDroite: 0,
      amcGauche: null,
      amcConsommables: null,
    });
  });

  it.each([
    ['part estimée : alerte de nouvelle version', 30_000, true],
    ['aucune part : rien à revoir', 0, false],
  ])('sur un devis émis, %s', (_, amc, attendu) => {
    expect(pecDiffereDuDevis(centimes(0), [offre(amc)])).toBe(attendu);
  });
});
