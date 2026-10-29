import { describe, expect, it } from 'vitest';

import { beneficiaireVitaleSchema } from '../ports/vitale-reader';
import { preRemplissageDepuisBeneficiaire } from './pre-remplissage';

const base = {
  nom: 'LEFEVRE',
  prenom: 'JEANNE',
  dateNaissance: '1950-03-05',
  rang: 2,
  nir: '269014999912339',
  qualite: 'AYANT_DROIT',
  regime: '01',
  caisse: '999',
  centreGestionnaire: '9999',
  droitsAmo: { debut: '2026-01-01', fin: '2026-12-31' },
  c2s: true,
  ald: false,
};

describe('preRemplissageDepuisBeneficiaire', () => {
  it('pré-remplit identité, AMO et AMC', () => {
    const b = beneficiaireVitaleSchema.parse({
      ...base,
      amc: {
        organismeNom: 'Mutuelle Démo',
        organismeIdentifiant: '99999991',
        numeroAdherent: 'A1',
        typeContrat: 'Contrat responsable',
        debutValidite: '2026-01-01',
        finValidite: '2026-12-31',
      },
    });
    expect(preRemplissageDepuisBeneficiaire(b)).toEqual({
      nomNaissance: 'LEFEVRE',
      prenoms: 'JEANNE',
      dateNaissance: '1950-03-05',
      amoNir: '269014999912339',
      amoRangNaissance: '2',
      amoQualite: 'AYANT_DROIT',
      amoRegime: '01',
      amoCaisse: '999',
      amoCentreGestionnaire: '9999',
      amoFinDroits: '2026-12-31',
      amoC2s: true,
      amoAld: false,
      amcOrganismeNom: 'Mutuelle Démo',
      amcOrganismeIdentifiant: '99999991',
      amcNumeroAdherent: 'A1',
      amcTypeContrat: 'Contrat responsable',
      amcDebutValidite: '2026-01-01',
      amcFinValidite: '2026-12-31',
    });
  });

  it('laisse vides les champs absents de la carte', () => {
    const b = beneficiaireVitaleSchema.parse({
      ...base,
      regime: null,
      caisse: null,
      centreGestionnaire: null,
      droitsAmo: { debut: null, fin: null },
      amc: {
        organismeNom: 'Mutuelle Démo',
        organismeIdentifiant: null,
        numeroAdherent: null,
        typeContrat: null,
        debutValidite: null,
        finValidite: null,
      },
    });
    expect(preRemplissageDepuisBeneficiaire(b)).toMatchObject({
      amoRegime: '',
      amoCaisse: '',
      amoCentreGestionnaire: '',
      amoFinDroits: '',
      amcOrganismeIdentifiant: '',
      amcNumeroAdherent: '',
      amcTypeContrat: '',
      amcDebutValidite: '',
      amcFinValidite: '',
    });
    expect(
      preRemplissageDepuisBeneficiaire(beneficiaireVitaleSchema.parse({ ...base, amc: null })),
    ).toMatchObject({ amcOrganismeNom: '', amcNumeroAdherent: '' });
  });
});
