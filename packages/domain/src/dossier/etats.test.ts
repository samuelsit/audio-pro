import { describe, expect, it } from 'vitest';

import {
  dossierEnCours,
  ETAPES_DOSSIER,
  friseDossier,
  LIBELLES_STATUTS_DOSSIER,
  prescriptionModifiable,
  STATUTS_DOSSIER,
  transitionDossierAutorisee,
  type StatutDossier,
} from './etats';

/** Statuts atteignables, écrits à la main : tout autre couple des 81 possibles est refusé. */
const AUTORISEES: Readonly<Record<StatutDossier, readonly StatutDossier[]>> = {
  BROUILLON: ['PRESCRIPTION_OK', 'ABANDONNE'],
  PRESCRIPTION_OK: ['DEVIS_EMIS', 'ABANDONNE'],
  DEVIS_EMIS: ['EN_ESSAI', 'ABANDONNE'],
  EN_ESSAI: ['DEVIS_SIGNE', 'ABANDONNE'],
  DEVIS_SIGNE: ['A_FACTURER', 'EN_ESSAI', 'ABANDONNE'],
  A_FACTURER: ['FACTURE'],
  FACTURE: ['CLOS', 'A_FACTURER'],
  CLOS: [],
  ABANDONNE: [],
};

const COUPLES = STATUTS_DOSSIER.flatMap((de) => STATUTS_DOSSIER.map((vers) => ({ de, vers })));

describe('transitionDossierAutorisee', () => {
  it('couvre les 81 couples', () => {
    expect(COUPLES).toHaveLength(81);
  });

  it.each(COUPLES)('$de → $vers', ({ de, vers }) => {
    expect(transitionDossierAutorisee(de, vers)).toBe(AUTORISEES[de].includes(vers));
  });

  it.each([
    { de: 'BROUILLON', vers: 'DEVIS_EMIS' },
    { de: 'PRESCRIPTION_OK', vers: 'EN_ESSAI' },
    { de: 'EN_ESSAI', vers: 'CLOS' },
  ] as const)('refuse le saut d’étape $de → $vers', ({ de, vers }) => {
    expect(transitionDossierAutorisee(de, vers)).toBe(false);
  });

  it.each([
    { de: 'DEVIS_EMIS', vers: 'BROUILLON' },
    { de: 'EN_ESSAI', vers: 'DEVIS_EMIS' },
    { de: 'CLOS', vers: 'FACTURE' },
    { de: 'ABANDONNE', vers: 'BROUILLON' },
  ] as const)('refuse le retour arrière $de → $vers', ({ de, vers }) => {
    expect(transitionDossierAutorisee(de, vers)).toBe(false);
  });
});

describe('libellés et étapes', () => {
  it('chaque statut a un libellé', () => {
    expect(Object.keys(LIBELLES_STATUTS_DOSSIER)).toEqual([...STATUTS_DOSSIER]);
  });

  it('ABANDONNE est hors du parcours', () => {
    expect(ETAPES_DOSSIER).toHaveLength(8);
    expect(ETAPES_DOSSIER).not.toContain('ABANDONNE');
  });
});

describe('prescriptionModifiable', () => {
  it.each(STATUTS_DOSSIER.map((statut) => ({ statut })))('$statut', ({ statut }) => {
    expect(prescriptionModifiable(statut)).toBe(
      statut === 'BROUILLON' || statut === 'PRESCRIPTION_OK',
    );
  });
});

describe('dossierEnCours', () => {
  it.each(STATUTS_DOSSIER.map((statut) => ({ statut })))('$statut', ({ statut }) => {
    expect(dossierEnCours(statut)).toBe(statut !== 'CLOS' && statut !== 'ABANDONNE');
  });
});

describe('friseDossier', () => {
  const PASSAGES = [
    { statut: 'BROUILLON', horodatage: '2026-10-01T09:00:00.000Z' },
    { statut: 'PRESCRIPTION_OK', horodatage: '2026-10-02T09:00:00.000Z' },
  ] as const;

  it('marque les étapes faites, l’étape courante et celles à venir', () => {
    const frise = friseDossier('PRESCRIPTION_OK', PASSAGES);
    expect(frise.slice(0, 3)).toEqual([
      { statut: 'BROUILLON', etat: 'FAITE', horodatage: PASSAGES[0].horodatage },
      { statut: 'PRESCRIPTION_OK', etat: 'COURANTE', horodatage: PASSAGES[1].horodatage },
      { statut: 'DEVIS_EMIS', etat: 'A_VENIR', horodatage: null },
    ]);
  });

  it('un dossier abandonné n’a pas d’étape courante', () => {
    const frise = friseDossier('ABANDONNE', [
      ...PASSAGES,
      { statut: 'ABANDONNE', horodatage: '2026-10-03T09:00:00.000Z' },
    ]);
    expect(frise.map((e) => e.etat).slice(0, 3)).toEqual(['FAITE', 'FAITE', 'A_VENIR']);
    expect(frise.some((e) => e.etat === 'COURANTE')).toBe(false);
  });
});
