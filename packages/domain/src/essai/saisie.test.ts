import { describe, expect, it } from 'vitest';

import {
  achatEssaiSaisieSchema,
  changementAppareilSaisieSchema,
  ISSUES_ESSAI,
  LIBELLES_ISSUES_ESSAI,
  LIBELLES_TYPES_RDV_ESSAI,
  prolongationEssaiSaisieSchema,
  rdvEssaiSaisieSchema,
  TYPES_RDV_ESSAI,
} from './saisie';

describe('rdvEssaiSaisieSchema', () => {
  it('nettoie le compte rendu', () => {
    expect(
      rdvEssaiSaisieSchema.parse({
        date: '2026-10-05',
        type: 'CONTROLE',
        compteRendu: '  Réglages ajustés  ',
      }),
    ).toEqual({ date: '2026-10-05', type: 'CONTROLE', compteRendu: 'Réglages ajustés' });
  });

  it.each([
    { cas: 'type inconnu', saisie: { type: 'AUTRE', compteRendu: 'x' } },
    { cas: 'compte rendu vide', saisie: { type: 'POSE', compteRendu: '  ' } },
    { cas: 'compte rendu trop long', saisie: { type: 'POSE', compteRendu: 'x'.repeat(501) } },
    { cas: 'date invalide', saisie: { type: 'POSE', compteRendu: 'x', date: '05/10/2026' } },
  ])('refuse : $cas', ({ saisie }) => {
    expect(rdvEssaiSaisieSchema.safeParse({ date: '2026-10-05', ...saisie }).success).toBe(false);
  });
});

describe('prolongationEssaiSaisieSchema', () => {
  const SAISIE = { dateDemande: '2026-10-20', jours: '15', motif: ' Suivi ORL ' };

  it('convertit les jours saisis en texte', () => {
    expect(prolongationEssaiSaisieSchema.parse(SAISIE)).toEqual({
      dateDemande: '2026-10-20',
      jours: 15,
      motif: 'Suivi ORL',
    });
  });

  it.each([
    { cas: '0 jour', jours: '0', message: 'Saisir au moins 1 jour.' },
    { cas: '16 jours', jours: '16', message: 'La prolongation est limitée à 15 jours.' },
    { cas: 'demi-journée', jours: '1.5', message: 'Saisir un nombre entier de jours.' },
    { cas: 'texte', jours: 'quinze', message: 'Saisir le nombre de jours.' },
  ])('refuse : $cas', ({ jours, message }) => {
    const r = prolongationEssaiSaisieSchema.safeParse({ ...SAISIE, jours });
    expect(r.error?.issues[0]?.message).toBe(message);
  });

  it('exige un motif', () => {
    expect(prolongationEssaiSaisieSchema.safeParse({ ...SAISIE, motif: ' ' }).success).toBe(false);
  });
});

describe('changementAppareilSaisieSchema', () => {
  const SAISIE = {
    statutAttendu: 'EN_ESSAI',
    oreille: 'DROITE',
    numeroSerie: ' ab 123 ',
    motif: 'Larsen persistant',
  };

  it('normalise le numéro de série', () => {
    expect(changementAppareilSaisieSchema.parse(SAISIE).numeroSerie).toBe('AB123');
  });

  it.each([
    { cas: 'oreille inconnue', champ: { oreille: 'LES_DEUX' } },
    { cas: 'numéro invalide', champ: { numeroSerie: 'a' } },
    { cas: 'motif vide', champ: { motif: '' } },
    { cas: 'statut inconnu', champ: { statutAttendu: 'ESSAI' } },
  ])('refuse : $cas', ({ champ }) => {
    expect(changementAppareilSaisieSchema.safeParse({ ...SAISIE, ...champ }).success).toBe(false);
  });
});

describe('achatEssaiSaisieSchema', () => {
  it('exige le statut affiché', () => {
    expect(achatEssaiSaisieSchema.parse({ statutAttendu: 'DEVIS_SIGNE' })).toEqual({
      statutAttendu: 'DEVIS_SIGNE',
    });
    expect(achatEssaiSaisieSchema.safeParse({}).success).toBe(false);
  });
});

describe('libellés', () => {
  it('chaque type et chaque issue a un texte', () => {
    for (const type of TYPES_RDV_ESSAI) {
      expect(LIBELLES_TYPES_RDV_ESSAI[type]).not.toBe('');
    }
    for (const issue of ISSUES_ESSAI) {
      expect(LIBELLES_ISSUES_ESSAI[issue]).not.toBe('');
    }
  });
});
