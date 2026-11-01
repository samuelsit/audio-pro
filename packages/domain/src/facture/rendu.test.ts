import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import { recapitulatifTva, rendreFactureHtml, type LigneVue, type VueFacture } from './rendu';

const AIDE: LigneVue = {
  nature: 'AIDE_AUDITIVE',
  libelle: 'Aurore <Essentiel>',
  oreille: 'DROITE',
  codeLpp: '7310442',
  codePrestation: 'P1D',
  numeroSerie: 'SN-1',
  quantite: 1,
  prixTTC: centimes(95_000),
  tauxTva: 550,
  montantHT: centimes(90_047),
  montantTva: centimes(4_953),
  baseRemboursement: centimes(40_000),
  amo: centimes(24_000),
  amc: centimes(0),
  resteACharge: centimes(71_000),
};

const PILE: LigneVue = {
  ...AIDE,
  nature: 'PILE',
  libelle: 'Piles 312',
  oreille: null,
  codeLpp: null,
  codePrestation: null,
  numeroSerie: null,
  prixTTC: centimes(1_200),
  tauxTva: 2000,
  montantHT: centimes(1_000),
  montantTva: centimes(200),
};

const VUE: VueFacture = {
  nature: 'FACTURE',
  numero: 'FA-000001',
  dateFacture: '2026-11-01',
  vendeur: {
    raisonSociale: 'Audition Fictive SAS',
    nomCentre: 'Centre de test',
    adresse: ['1 rue de la Paix', '75002 Paris'],
    telephone: '0100000000',
    email: 'centre@example.test',
    siret: '00000000000000',
    rcs: 'Paris 000 000 000',
    finess: '750000000',
    tvaIntracommunautaire: 'FR00000000000',
  },
  client: { prenomNom: 'Jeanne Fictive', adresse: ['2 rue Test'] },
  lignes: [AIDE, PILE],
  totaux: {
    prixTTC: centimes(96_200),
    ht: centimes(91_047),
    tva: centimes(5_153),
    amo: centimes(24_000),
    amc: centimes(0),
    resteACharge: centimes(72_200),
  },
  origine: null,
};

describe('rendreFactureHtml', () => {
  const html = rendreFactureHtml(VUE, { duplicata: false });

  it('porte les mentions du vendeur, du client et des lignes', () => {
    for (const attendu of [
      'Facture n° FA-000001',
      'Date : 01/11/2026',
      'SIRET : 00000000000000',
      'RCS : Paris 000 000 000',
      'FINESS : 750000000',
      'TVA intracommunautaire : FR00000000000',
      'Jeanne Fictive',
      'LPP 7310442',
      'Code P1D',
      'N° de série SN-1',
      'Oreille droite',
      'Reste à charge',
    ]) {
      expect(html).toContain(attendu);
    }
  });

  it('porte la garantie et le jour où la facture marque la délivrance', () => {
    expect(html).toContain('Une garantie minimale de 4 ans');
    expect(html).toContain('La date de facturation marque la délivrance');
    expect(html).toContain('01/11/2030');
  });

  it('échappe les données', () => {
    expect(html).toContain('Aurore &lt;Essentiel&gt;');
  });

  it('marque un duplicata, sans changer le reste', () => {
    const duplicata = rendreFactureHtml(VUE, { duplicata: true });
    expect(html).not.toContain('DUPLICATA');
    expect(duplicata).toContain('DUPLICATA');
    expect(duplicata.replace('<div class="duplicata">DUPLICATA</div>', '')).toBe(html);
  });

  it('un avoir cite la facture et son motif, sans garantie', () => {
    const avoir = rendreFactureHtml(
      {
        ...VUE,
        nature: 'AVOIR',
        numero: 'FA-000002',
        origine: { numero: 'FA-000001', dateFacture: '2026-10-01', motif: 'Erreur de prix' },
      },
      { duplicata: false },
    );
    expect(avoir).toContain('Avoir n° FA-000002');
    expect(avoir).toContain('Avoir sur la facture n° FA-000001 du 01/10/2026');
    expect(avoir).toContain('Erreur de prix');
    expect(avoir).not.toContain('Une garantie minimale');
  });

  it('sans aide auditive, pas de garantie ; sans identifiant, pas de ligne vide', () => {
    const vente = rendreFactureHtml(
      {
        ...VUE,
        lignes: [PILE],
        vendeur: { ...VUE.vendeur, rcs: null, raisonSociale: null },
      },
      { duplicata: false },
    );
    expect(vente).not.toContain('Une garantie minimale');
    expect(vente).not.toContain('RCS');
  });
});

describe('recapitulatifTva', () => {
  it('regroupe par taux, du plus faible au plus fort', () => {
    expect(recapitulatifTva([PILE, AIDE, PILE])).toEqual([
      { taux: 550, ht: 90_047, tva: 4_953 },
      { taux: 2000, ht: 2_000, tva: 400 },
    ]);
  });

  it.each([
    ['sans tiers payant', { tiersPayantAmo: false }, true],
    ['avec tiers payant', { tiersPayantAmo: true }, false],
    ['facture antérieure', {}, false],
  ])('net à régler : %s', (_, surcharge, attendu) => {
    expect(
      rendreFactureHtml({ ...VUE, ...surcharge }, { duplicata: false }).includes('Net à régler'),
    ).toBe(attendu);
  });
});
