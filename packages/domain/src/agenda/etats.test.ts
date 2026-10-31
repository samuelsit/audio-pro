import { describe, expect, it } from 'vitest';

import {
  estDeplacable,
  etapeSalleAttente,
  occupeLeCreneau,
  peutPasserA,
  STATUTS_RDV,
} from './etats';

describe('peutPasserA', () => {
  it.each([
    { de: 'PLANIFIE', vers: 'CONFIRME', attendu: true },
    { de: 'PLANIFIE', vers: 'ARRIVE', attendu: true },
    { de: 'PLANIFIE', vers: 'VU', attendu: false },
    { de: 'CONFIRME', vers: 'ANNULE', attendu: true },
    { de: 'CONFIRME', vers: 'PLANIFIE', attendu: false },
    { de: 'ARRIVE', vers: 'VU', attendu: true },
    { de: 'ARRIVE', vers: 'ABSENT', attendu: false },
    { de: 'ABSENT', vers: 'ARRIVE', attendu: true },
    { de: 'ABSENT', vers: 'ANNULE', attendu: false },
    { de: 'VU', vers: 'ANNULE', attendu: false },
    { de: 'ANNULE', vers: 'PLANIFIE', attendu: false },
  ] as const)('$de → $vers : $attendu', ({ de, vers, attendu }) => {
    expect(peutPasserA(de, vers)).toBe(attendu);
  });
});

describe('statuts', () => {
  it('seuls un RDV planifié ou confirmé se déplace', () => {
    expect(STATUTS_RDV.filter(estDeplacable)).toEqual(['PLANIFIE', 'CONFIRME']);
  });

  it('un absent et un annulé libèrent le créneau', () => {
    expect(STATUTS_RDV.filter((s) => !occupeLeCreneau(s))).toEqual(['ABSENT', 'ANNULE']);
  });
});

describe('etapeSalleAttente', () => {
  it.each([
    { statut: 'PLANIFIE', priseEnCharge: false, attendu: null },
    { statut: 'ABSENT', priseEnCharge: false, attendu: null },
    { statut: 'ARRIVE', priseEnCharge: false, attendu: 'ARRIVE' },
    { statut: 'ARRIVE', priseEnCharge: true, attendu: 'EN_COURS' },
    { statut: 'VU', priseEnCharge: true, attendu: 'TERMINE' },
  ] as const)('$statut, pris en charge : $priseEnCharge', ({ statut, priseEnCharge, attendu }) => {
    expect(etapeSalleAttente(statut, priseEnCharge)).toBe(attendu);
  });
});
