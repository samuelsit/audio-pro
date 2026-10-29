import { describe, expect, it } from 'vitest';

import type { IdentiteComparable } from '../patient/doublons';
import { beneficiaireVitaleSchema } from '../ports/vitale-reader';
import { ficheCorrespondAuBeneficiaire, identiteDepuisBeneficiaire } from './correspondance';

const EMPREINTE = 'a'.repeat(64);

// Enfant ayant droit, porté sur la carte du parent (NIR fictif du parent).
const enfant = beneficiaireVitaleSchema.parse({
  nom: 'DURAND',
  prenom: 'HUGO',
  dateNaissance: '2012-06-20',
  rang: 1,
  nir: '269014999912339',
  qualite: 'AYANT_DROIT',
  regime: null,
  caisse: null,
  centreGestionnaire: null,
  droitsAmo: { debut: null, fin: null },
  c2s: false,
  ald: false,
  amc: null,
});

const ficheEnfant: IdentiteComparable = {
  nomNaissance: 'Durand',
  nomUsage: null,
  dateNaissance: '2012-06-20',
  nirEmpreinte: EMPREINTE,
  qualite: 'AYANT_DROIT',
  rangNaissance: 1,
};

describe('identiteDepuisBeneficiaire', () => {
  it('reprend nom, date, qualité et rang de la carte', () => {
    expect(identiteDepuisBeneficiaire(enfant, EMPREINTE)).toEqual({
      nomNaissance: 'DURAND',
      nomUsage: null,
      dateNaissance: '2012-06-20',
      nirEmpreinte: EMPREINTE,
      qualite: 'AYANT_DROIT',
      rangNaissance: 1,
    });
  });
});

describe('ficheCorrespondAuBeneficiaire', () => {
  it.each<{ cas: string; fiche: IdentiteComparable; attendu: boolean }>([
    { cas: 'même enfant', fiche: ficheEnfant, attendu: true },
    {
      cas: 'frère ou sœur de rang 1 né un autre jour',
      fiche: { ...ficheEnfant, dateNaissance: '2015-02-08' },
      attendu: false,
    },
    { cas: 'jumeau de rang 2', fiche: { ...ficheEnfant, rangNaissance: 2 }, attendu: false },
    { cas: 'l’assuré ouvrant droit', fiche: { ...ficheEnfant, qualite: 'ASSURE' }, attendu: false },
    { cas: 'autre NIR', fiche: { ...ficheEnfant, nirEmpreinte: 'b'.repeat(64) }, attendu: false },
    {
      cas: 'fiche sans AMO',
      fiche: { ...ficheEnfant, nirEmpreinte: null, qualite: null },
      attendu: false,
    },
  ])('$cas → $attendu', ({ fiche, attendu }) => {
    expect(ficheCorrespondAuBeneficiaire(enfant, EMPREINTE, fiche)).toBe(attendu);
  });

  it('deux assurés de même NIR : même personne', () => {
    const assure = { ...enfant, qualite: 'ASSURE' as const };
    expect(
      ficheCorrespondAuBeneficiaire(assure, EMPREINTE, {
        ...ficheEnfant,
        qualite: 'ASSURE',
        rangNaissance: 3,
      }),
    ).toBe(true);
  });
});
