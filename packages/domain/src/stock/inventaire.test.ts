import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import {
  comptageAccessoireSaisieSchema,
  ecartAccessoire,
  ecartsAppareils,
  justificationEcartSaisieSchema,
  ouvertureInventaireSaisieSchema,
  peutGererInventaire,
  pointageAppareilSaisieSchema,
} from './inventaire';

const UUID = '0192f0a0-0000-7000-8000-000000000001';

describe('ecartsAppareils', () => {
  it.each([
    { attendus: [], pointes: [], manquants: [], excedents: [] },
    { attendus: ['A', 'B'], pointes: ['B', 'A'], manquants: [], excedents: [] },
    { attendus: ['B', 'A'], pointes: [], manquants: ['A', 'B'], excedents: [] },
    { attendus: [], pointes: ['D', 'C'], manquants: [], excedents: ['C', 'D'] },
    { attendus: ['A', 'B'], pointes: ['B', 'C'], manquants: ['A'], excedents: ['C'] },
    { attendus: ['A', 'A'], pointes: ['A'], manquants: [], excedents: [] },
  ])('$attendus contre $pointes', ({ attendus, pointes, manquants, excedents }) => {
    expect(ecartsAppareils(attendus, pointes)).toEqual({ manquants, excedents });
  });
});

describe('ecartAccessoire', () => {
  it.each([
    [10, 10, 0],
    [10, 7, -3],
    [10, 12, 2],
    [0, 4, 4],
  ])('théorique %i, compté %i : %i', (theorique, compte, ecart) => {
    expect(ecartAccessoire(theorique, compte)).toBe(ecart);
  });
});

describe('peutGererInventaire', () => {
  it.each(ROLES)('%s', (role) => {
    expect(peutGererInventaire(role)).toBe(role === 'ADMIN_CLIENT' || role === 'RESPONSABLE_CENTRE');
  });
});

describe('saisies', () => {
  it('ouverture : un centre est requis', () => {
    expect(ouvertureInventaireSaisieSchema.safeParse({ centreId: UUID }).success).toBe(true);
    expect(ouvertureInventaireSaisieSchema.safeParse({ centreId: '' }).success).toBe(false);
  });

  it('pointage : le numéro est normalisé', () => {
    expect(pointageAppareilSaisieSchema.parse({ numeroSerie: ' ab 12 ' }).numeroSerie).toBe('AB12');
  });

  it.each([
    ['0', 0],
    ['12', 12],
  ])('comptage : %s est accepté', (saisie, quantite) => {
    expect(
      comptageAccessoireSaisieSchema.parse({ accessoireId: UUID, quantiteComptee: saisie })
        .quantiteComptee,
    ).toBe(quantite);
  });

  it.each(['-1', '1.5', 'abc', '100001'])('comptage : %s est refusé', (saisie) => {
    expect(
      comptageAccessoireSaisieSchema.safeParse({ accessoireId: UUID, quantiteComptee: saisie })
        .success,
    ).toBe(false);
  });

  it('justification : sur un numéro ou un accessoire, jamais vide', () => {
    expect(
      justificationEcartSaisieSchema.safeParse({ numeroSerie: 'AB12', justification: 'Casse' })
        .success,
    ).toBe(true);
    expect(
      justificationEcartSaisieSchema.safeParse({ accessoireId: UUID, justification: 'Casse' })
        .success,
    ).toBe(true);
    expect(
      justificationEcartSaisieSchema.safeParse({ numeroSerie: 'AB12', justification: ' ' }).success,
    ).toBe(false);
    expect(justificationEcartSaisieSchema.safeParse({ justification: 'Casse' }).success).toBe(false);
  });
});
