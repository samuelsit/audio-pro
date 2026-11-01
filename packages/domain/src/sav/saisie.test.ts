import { describe, expect, it } from 'vitest';

import {
  diagnosticTicketSchema,
  filtreTicketsSchema,
  motifObligatoireSchema,
  ouvertureTicketSchema,
  venteComptoirSchema,
} from './saisie';

describe('ouvertureTicketSchema', () => {
  it('normalise le numéro de série et vide la description', () => {
    const saisie = { numeroSerie: ' ab 12 ', motif: 'PANNE', description: ' ' };
    expect(ouvertureTicketSchema.parse(saisie)).toEqual({
      numeroSerie: 'AB12',
      motif: 'PANNE',
      description: null,
    });
  });

  it.each([
    { numeroSerie: '', motif: 'PANNE', description: '' },
    { numeroSerie: 'A', motif: 'INCONNU', description: '' },
    { numeroSerie: 'A', motif: 'PANNE', description: 'x'.repeat(2001) },
  ])('refuse %j', (saisie) => {
    expect(ouvertureTicketSchema.safeParse(saisie).success).toBe(false);
  });
});

describe('diagnosticTicketSchema', () => {
  const valide = { motif: 'CASSE', diagnostic: 'Coque fêlée', action: 'ECHANGE', cout: '45,50' };

  it('lit le coût en centimes', () => {
    expect(diagnosticTicketSchema.parse(valide)).toMatchObject({ cout: 4550 });
  });

  it('un coût vide reste inconnu', () => {
    expect(diagnosticTicketSchema.parse({ ...valide, cout: ' ' })).toMatchObject({ cout: null });
  });

  it.each([{ cout: 'abc' }, { diagnostic: ' ' }, { action: 'AUTRE' }])('refuse %j', (ecart) => {
    expect(diagnosticTicketSchema.safeParse({ ...valide, ...ecart }).success).toBe(false);
  });
});

describe('motifObligatoireSchema', () => {
  it('refuse un motif vide', () => {
    expect(motifObligatoireSchema.safeParse({ motif: ' ' }).success).toBe(false);
  });
});

describe('filtreTicketsSchema', () => {
  it('ignore les valeurs inconnues', () => {
    expect(filtreTicketsSchema.parse({ statut: 'X', motif: 'Y' })).toEqual({
      page: 1,
      statut: undefined,
      motif: undefined,
    });
  });
});

describe('venteComptoirSchema', () => {
  const UUID = '018f0000-0000-7000-8000-000000000001';
  const base = {
    patientId: UUID,
    centreId: UUID,
    prescriptionId: '',
    lignes: [{ accessoireId: UUID, quantite: '2' }],
    entretienLibelle: '',
    entretienPrix: '',
  };

  it('lit les quantités', () => {
    expect(venteComptoirSchema.parse(base).lignes).toEqual([{ accessoireId: UUID, quantite: 2 }]);
  });

  it('accepte un entretien seul', () => {
    const saisie = { ...base, lignes: [], entretienLibelle: 'Nettoyage', entretienPrix: '10' };
    expect(venteComptoirSchema.parse(saisie)).toMatchObject({ entretienPrix: 1000 });
  });

  it.each([
    { cas: 'rien à vendre', ecart: { lignes: [] } },
    { cas: 'libellé sans prix', ecart: { entretienLibelle: 'Nettoyage' } },
    { cas: 'prix sans libellé', ecart: { entretienPrix: '10' } },
    { cas: 'quantité nulle', ecart: { lignes: [{ accessoireId: UUID, quantite: '0' }] } },
  ])('refuse : $cas', ({ ecart }) => {
    expect(venteComptoirSchema.safeParse({ ...base, ...ecart }).success).toBe(false);
  });
});
