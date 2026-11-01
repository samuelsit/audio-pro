import { describe, expect, it } from 'vitest';

import {
  achatEssaiSaisieSchema,
  changementAppareilSaisieSchema,
  ISSUES_ESSAI,
  LIBELLES_ISSUES_ESSAI,
  compteRenduRdvSaisieSchema,
  LIBELLES_TYPES_RDV_ESSAI,
  planificationRdvEssaiSaisieSchema,
  prolongationEssaiSaisieSchema,
  TYPES_RDV_ESSAI,
} from './saisie';

describe('compteRenduRdvSaisieSchema', () => {
  it('nettoie le compte rendu', () => {
    expect(compteRenduRdvSaisieSchema.parse({ compteRendu: '  Réglages ajustés  ' })).toEqual({
      compteRendu: 'Réglages ajustés',
    });
  });

  it.each([
    { cas: 'vide', compteRendu: '  ' },
    { cas: 'trop long', compteRendu: 'x'.repeat(501) },
  ])('refuse : $cas', ({ compteRendu }) => {
    expect(compteRenduRdvSaisieSchema.safeParse({ compteRendu }).success).toBe(false);
  });
});

describe('planificationRdvEssaiSaisieSchema', () => {
  const SAISIE = {
    typeRdvId: 'type',
    date: '2026-10-05',
    heure: '10:30',
    confirmerHorsDisponibilites: false,
  };

  it('accepte une saisie complète', () => {
    expect(planificationRdvEssaiSaisieSchema.parse(SAISIE)).toEqual(SAISIE);
  });

  it.each([
    { cas: 'type vide', surcharge: { typeRdvId: '' } },
    { cas: 'date invalide', surcharge: { date: '05/10/2026' } },
    { cas: 'heure invalide', surcharge: { heure: '25:00' } },
  ])('refuse : $cas', ({ surcharge }) => {
    expect(planificationRdvEssaiSaisieSchema.safeParse({ ...SAISIE, ...surcharge }).success).toBe(
      false,
    );
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
    motifRetrait: 'Larsen persistant',
  };

  it('normalise le numéro de série', () => {
    expect(changementAppareilSaisieSchema.parse(SAISIE).numeroSerie).toBe('AB123');
  });

  it.each([
    { cas: 'oreille inconnue', champ: { oreille: 'LES_DEUX' } },
    { cas: 'numéro invalide', champ: { numeroSerie: 'a' } },
    { cas: 'motif vide', champ: { motifRetrait: '' } },
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
