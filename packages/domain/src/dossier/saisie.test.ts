import { describe, expect, it } from 'vitest';

import {
  abandonDossierSaisieSchema,
  dossierSaisieSchema,
  prescriptionSaisieSchema,
} from './saisie';

const ID = '019a5000-0000-7000-8000-000000000001';
const DOSSIER = {
  centreId: ID,
  praticienId: ID,
  oreilles: 'LES_DEUX',
  typeDroite: 'RENOUVELLEMENT',
  typeGauche: 'PRIMO',
  surdicecite: false,
};

function chemins(resultat: ReturnType<typeof dossierSaisieSchema.safeParse>): unknown[] {
  return resultat.error?.issues.map((i) => i.path[0]) ?? [];
}

describe('dossierSaisieSchema', () => {
  it('accepte un type par oreille', () => {
    expect(dossierSaisieSchema.parse(DOSSIER)).toEqual({ ...DOSSIER, rdvId: null, bilanId: null });
  });

  it.each([
    { cas: 'droite sans type', saisie: { typeDroite: '' }, champs: ['typeDroite'] },
    { cas: 'gauche sans type', saisie: { typeGauche: '' }, champs: ['typeGauche'] },
    { cas: 'type inconnu', saisie: { typeDroite: 'AUTRE' }, champs: ['typeDroite'] },
    { cas: 'oreilles absentes', saisie: { oreilles: '' }, champs: ['oreilles'] },
  ])('refuse : $cas', ({ saisie, champs }) => {
    expect(chemins(dossierSaisieSchema.safeParse({ ...DOSSIER, ...saisie }))).toEqual(champs);
  });

  it.each([
    { oreilles: 'DROITE', typeDroite: 'RENOUVELLEMENT', typeGauche: null },
    { oreilles: 'GAUCHE', typeDroite: null, typeGauche: 'PRIMO' },
  ])('oublie le type de l’oreille écartée : $oreilles', (attendu) => {
    expect(dossierSaisieSchema.parse({ ...DOSSIER, oreilles: attendu.oreilles })).toMatchObject(
      attendu,
    );
  });
});

describe('prescriptionSaisieSchema', () => {
  const PRESCRIPTION = {
    prescripteurId: ID,
    datePrescription: '2026-10-20',
    oreilles: 'DROITE',
    mentionRenouvellement: true,
    statutAttendu: 'BROUILLON',
    forcer: false,
    motifForcage: '',
  };

  it('un motif vide devient null', () => {
    expect(prescriptionSaisieSchema.parse(PRESCRIPTION).motifForcage).toBeNull();
  });

  it.each([
    { cas: 'prescripteur absent', saisie: { prescripteurId: '' } },
    { cas: 'date impossible', saisie: { datePrescription: '2026-02-30' } },
    { cas: 'motif trop long', saisie: { motifForcage: 'x'.repeat(501) } },
  ])('refuse : $cas', ({ saisie }) => {
    expect(prescriptionSaisieSchema.safeParse({ ...PRESCRIPTION, ...saisie }).success).toBe(false);
  });
});

describe('abandonDossierSaisieSchema', () => {
  it('exige un motif', () => {
    const saisie = { statutAttendu: 'BROUILLON', motif: '  ' };
    expect(abandonDossierSaisieSchema.safeParse(saisie).success).toBe(false);
    expect(abandonDossierSaisieSchema.parse({ ...saisie, motif: ' Patient décédé ' }).motif).toBe(
      'Patient décédé',
    );
  });
});
