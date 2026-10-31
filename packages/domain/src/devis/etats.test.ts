import { describe, expect, it } from 'vitest';

import { STATUTS_DOSSIER } from '../dossier/etats';
import { peutEmettreDevis, peutEnregistrerSignature } from './droits';
import {
  devisEchu,
  devisModifiable,
  dossierAccepteDevis,
  LIBELLES_STATUTS_DEVIS,
  nouvelleVersionPossible,
  statutDossierApresEmission,
  STATUTS_DEVIS,
} from './etats';

describe('statuts du devis', () => {
  it('chaque statut a un libellé', () => {
    expect(Object.keys(LIBELLES_STATUTS_DEVIS)).toEqual([...STATUTS_DEVIS]);
  });

  it.each([
    { statut: 'BROUILLON', modifiable: true, version: false },
    { statut: 'EMIS', modifiable: false, version: true },
    { statut: 'SIGNE', modifiable: false, version: true },
    { statut: 'REMPLACE', modifiable: false, version: false },
  ] as const)('$statut', ({ statut, modifiable, version }) => {
    expect(devisModifiable(statut)).toBe(modifiable);
    expect(nouvelleVersionPossible(statut)).toBe(version);
  });
});

describe('dossierAccepteDevis', () => {
  const ACCEPTES = ['PRESCRIPTION_OK', 'DEVIS_EMIS', 'EN_ESSAI', 'DEVIS_SIGNE'];

  it.each(STATUTS_DOSSIER.map((statut) => ({ statut })))('$statut', ({ statut }) => {
    expect(dossierAccepteDevis(statut)).toBe(ACCEPTES.includes(statut));
  });
});

describe('statutDossierApresEmission', () => {
  it.each([
    { statut: 'PRESCRIPTION_OK', attendu: 'DEVIS_EMIS' },
    { statut: 'DEVIS_EMIS', attendu: null },
    { statut: 'EN_ESSAI', attendu: null },
    { statut: 'DEVIS_SIGNE', attendu: 'EN_ESSAI' },
  ] as const)('$statut → $attendu', ({ statut, attendu }) => {
    expect(statutDossierApresEmission(statut)).toBe(attendu);
  });
});

describe('devisEchu', () => {
  it.each([
    { jour: '2026-12-29', echu: false },
    { jour: '2026-12-30', echu: false },
    { jour: '2026-12-31', echu: true },
  ])('$jour', ({ jour, echu }) => {
    expect(devisEchu('2026-12-30', jour)).toBe(echu);
  });
});

describe('droits', () => {
  it.each([
    { role: 'ADMIN', autorise: true },
    { role: 'AUDIO', autorise: true },
    { role: 'ASSISTANT', autorise: false },
  ] as const)('$role', ({ role, autorise }) => {
    expect(peutEmettreDevis(role)).toBe(autorise);
    expect(peutEnregistrerSignature(role)).toBe(autorise);
  });
});
