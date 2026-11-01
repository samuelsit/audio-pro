import { describe, expect, it } from 'vitest';

import { rendreBonRetourHtml, type BonRetourVue } from './bon-retour';
import {
  correctionSerieSchema,
  envoiRetourSchema,
  issueRetourSchema,
  LIBELLES_STATUTS_RETOUR,
  preparationRetourSchema,
  remplacantSaisieSchema,
  STATUTS_RETOUR,
} from './retour';

const UUID = '018f0000-0000-7000-8000-000000000001';

describe('preparationRetourSchema', () => {
  const base = { fournisseurId: UUID, descriptionPanne: '' };

  it.each([
    { ticketId: UUID, appareilId: '', ecartId: '' },
    { ticketId: '', appareilId: UUID, ecartId: '' },
    { ticketId: '', appareilId: '', ecartId: UUID },
  ])('accepte une source', (source) => {
    expect(preparationRetourSchema.safeParse({ ...base, ...source }).success).toBe(true);
  });

  it.each([
    { ticketId: '', appareilId: '', ecartId: '' },
    { ticketId: UUID, appareilId: UUID, ecartId: '' },
  ])('refuse zéro ou deux sources', (source) => {
    expect(preparationRetourSchema.safeParse({ ...base, ...source }).success).toBe(false);
  });

  it('borne la description', () => {
    const saisie = { ...base, ticketId: UUID, descriptionPanne: 'x'.repeat(501) };
    expect(preparationRetourSchema.safeParse(saisie).success).toBe(false);
  });
});

describe('envoi et issue', () => {
  it('exige une date d’envoi valide', () => {
    expect(
      envoiRetourSchema.safeParse({ transporteur: '', numeroSuivi: '', dateEnvoi: '' }).success,
    ).toBe(false);
    expect(
      envoiRetourSchema.parse({ transporteur: 'X', numeroSuivi: '', dateEnvoi: '2026-11-01' }),
    ).toEqual({ transporteur: 'X', numeroSuivi: null, dateEnvoi: '2026-11-01' });
  });

  it('une issue manuelle est réparé ou refusé', () => {
    expect(issueRetourSchema.safeParse({ issue: 'ECHANGE' }).success).toBe(false);
    expect(issueRetourSchema.parse({ issue: 'REPARE' })).toEqual({ issue: 'REPARE' });
  });
});

describe('remplacantSaisieSchema', () => {
  const valide = {
    modeleId: UUID,
    numeroSerie: ' ab 12',
    confirmation: 'AB12 ',
    referenceBonLivraison: 'BL-1',
  };

  it('normalise et compare les deux saisies', () => {
    expect(remplacantSaisieSchema.parse(valide)).toMatchObject({ numeroSerie: 'AB12' });
    const ecart = { ...valide, confirmation: 'AB13' };
    expect(remplacantSaisieSchema.safeParse(ecart).success).toBe(false);
  });

  it('exige le bon de livraison', () => {
    const saisie = { ...valide, referenceBonLivraison: ' ' };
    expect(remplacantSaisieSchema.safeParse(saisie).success).toBe(false);
  });

  it('une correction compare aussi les deux saisies', () => {
    const saisie = { numeroSerie: 'A1', confirmation: 'A2' };
    expect(correctionSerieSchema.safeParse(saisie).success).toBe(false);
  });
});

describe('rendreBonRetourHtml', () => {
  const VUE: BonRetourVue = {
    numero: 'RET-2026-000001',
    dateBon: '2026-11-01',
    expediteur: {
      raisonSociale: 'Audition Fictive',
      siret: '00000000000000',
      nom: 'Centre A',
      adresse: ['1 rue Fictive'],
      telephone: '0100000000',
      email: 'a@exemple.test',
    },
    fournisseur: { nom: 'Fabricant Fictif', adresse: '2 rue Fictive' },
    reference: 'SAV-2026-000001',
    designation: 'Gamme <Modèle>',
    numeroSerie: 'SN1',
    quantite: 1,
    dateDelivrance: '2026-01-05',
    sousGarantie: true,
    motif: 'PANNE',
    description: 'Ne s’allume plus',
  };

  it('porte l’appareil et échappe les données', () => {
    const html = rendreBonRetourHtml(VUE);
    expect(html).toContain('Bon de retour n° RET-2026-000001');
    expect(html).toContain('Sous garantie');
    expect(html).toContain('SIRET 00000000000000');
    expect(html).toContain('2 rue Fictive');
    expect(html).toContain('Gamme &lt;Modèle&gt;');
  });

  it('omet ce qui manque', () => {
    const html = rendreBonRetourHtml({
      ...VUE,
      expediteur: { ...VUE.expediteur, siret: null },
      fournisseur: { nom: 'Fabricant Fictif', adresse: null },
      reference: null,
      numeroSerie: null,
      dateDelivrance: null,
      sousGarantie: null,
      motif: null,
      description: null,
    });
    expect(html).not.toContain('Garantie');
    expect(html).not.toContain('Numéro de série');
    expect(html).not.toContain('SIRET');
    expect(html).not.toContain('Motif');
  });

  it('indique un appareil hors garantie', () => {
    expect(rendreBonRetourHtml({ ...VUE, sousGarantie: false })).toContain('Hors garantie');
  });
});

describe('libellés', () => {
  it('chaque statut a un texte', () => {
    for (const statut of STATUTS_RETOUR) {
      expect(LIBELLES_STATUTS_RETOUR[statut]).not.toBe('');
    }
  });
});
