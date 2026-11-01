import { describe, expect, it } from 'vitest';

import {
  assuranceSaisieSchema,
  COUVERTURES_SAV,
  couvertureTicket,
  DUREE_GARANTIE_MINIMALE_MOIS,
  finGarantie,
  LIBELLES_COUVERTURES_SAV,
  LIBELLES_MOTIFS_SAV,
  MOTIFS_SAV,
  periodeEnCours,
} from './garantie';

const GARANTIE = { dateFin: '2030-03-15', assuranceFin: null };
const ASSUREE = { dateFin: '2030-03-15', assuranceFin: '2028-06-30' };

describe('finGarantie', () => {
  it('le plancher vaut les 4 ans du modèle de devis', () => {
    expect(DUREE_GARANTIE_MINIMALE_MOIS).toBe(48);
  });

  it.each([
    { delivrance: '2026-03-15', mois: 48, fin: '2030-03-15' },
    { delivrance: '2024-02-29', mois: 48, fin: '2028-02-29' },
    { delivrance: '2024-02-29', mois: 60, fin: '2029-02-28' },
    { delivrance: '2026-01-31', mois: 49, fin: '2030-02-28' },
  ])('$delivrance + $mois mois : $fin', ({ delivrance, mois, fin }) => {
    expect(finGarantie(delivrance, mois)).toBe(fin);
  });
});

describe('periodeEnCours', () => {
  it.each([
    { fin: '2030-03-15', jour: '2030-03-14', attendu: true },
    { fin: '2030-03-15', jour: '2030-03-15', attendu: true },
    { fin: '2030-03-15', jour: '2030-03-16', attendu: false },
    { fin: null, jour: '2030-03-15', attendu: false },
  ])('fin $fin, le $jour : $attendu', ({ fin, jour, attendu }) => {
    expect(periodeEnCours(fin, jour)).toBe(attendu);
  });
});

describe('couvertureTicket', () => {
  it.each([
    { cas: 'panne, veille de la fin', motif: 'PANNE', g: GARANTIE, jour: '2030-03-14', a: 'GARANTIE' },
    { cas: 'panne, dernier jour', motif: 'PANNE', g: GARANTIE, jour: '2030-03-15', a: 'GARANTIE' },
    { cas: 'panne, lendemain', motif: 'PANNE', g: GARANTIE, jour: '2030-03-16', a: 'AUCUNE' },
    { cas: 'panne sans garantie', motif: 'PANNE', g: null, jour: '2027-01-01', a: 'AUCUNE' },
    { cas: 'casse assurée', motif: 'CASSE', g: ASSUREE, jour: '2027-01-01', a: 'ASSURANCE' },
    { cas: 'perte assurée', motif: 'PERTE', g: ASSUREE, jour: '2028-06-30', a: 'ASSURANCE' },
    { cas: 'vol assuré', motif: 'VOL', g: ASSUREE, jour: '2027-01-01', a: 'ASSURANCE' },
    { cas: 'casse, assurance expirée', motif: 'CASSE', g: ASSUREE, jour: '2028-07-01', a: 'AUCUNE' },
    { cas: 'casse sans assurance', motif: 'CASSE', g: GARANTIE, jour: '2027-01-01', a: 'AUCUNE' },
    { cas: 'entretien assuré', motif: 'ENTRETIEN', g: ASSUREE, jour: '2027-01-01', a: 'AUCUNE' },
    { cas: 'autre motif', motif: 'AUTRE', g: GARANTIE, jour: '2027-01-01', a: 'AUCUNE' },
  ] as const)('$cas : $a', ({ motif, g, jour, a }) => {
    expect(couvertureTicket(motif, g, jour)).toBe(a);
  });
});

describe('assuranceSaisieSchema', () => {
  it('garde une assurance complète', () => {
    const saisie = { assureur: ' Mutuelle fictive ', contrat: '', assuranceFin: '2028-06-30' };
    expect(assuranceSaisieSchema.parse(saisie)).toEqual({
      assureur: 'Mutuelle fictive',
      contrat: null,
      assuranceFin: '2028-06-30',
    });
  });

  it('exige une date de fin', () => {
    const resultat = assuranceSaisieSchema.safeParse({ assureur: 'X', contrat: '', assuranceFin: '' });
    expect(resultat.success).toBe(false);
  });

  it('sans assureur, retire tout', () => {
    const saisie = { assureur: '', contrat: 'C-1', assuranceFin: '' };
    expect(assuranceSaisieSchema.parse(saisie)).toEqual({
      assureur: null,
      contrat: null,
      assuranceFin: null,
    });
  });
});

describe('libellés', () => {
  it('chaque motif et chaque couverture a un texte', () => {
    for (const motif of MOTIFS_SAV) {
      expect(LIBELLES_MOTIFS_SAV[motif]).not.toBe('');
    }
    for (const couverture of COUVERTURES_SAV) {
      expect(LIBELLES_COUVERTURES_SAV[couverture]).not.toBe('');
    }
  });
});
