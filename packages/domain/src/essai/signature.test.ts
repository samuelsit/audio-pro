import { describe, expect, it } from 'vitest';

import { etatEssai } from '../audio-rules/essai';
import {
  blocagesSignature,
  CODES_BLOCAGE_SIGNATURE,
  MESSAGES_BLOCAGE_SIGNATURE,
} from './signature';

const etat = (aujourdhui: string, rdvs: readonly string[]) =>
  etatEssai({ debut: '2026-10-01', prolongation: null, rdvs, aujourdhui });

const DEUX_RDV = ['2026-10-05', '2026-10-20'];
const APPAREILS = [{ oreille: 'DROITE', modeleId: 'modele-a' }] as const;
const OFFRE = { DROITE: 'modele-a' };

describe('blocagesSignature', () => {
  it.each([
    {
      cas: 'échéance atteinte, 2 rendez-vous, bon modèle',
      entree: { etat: etat('2026-10-31', DEUX_RDV), appareils: APPAREILS, modelesOffre: OFFRE },
      attendu: [],
    },
    {
      cas: 'veille de l’échéance',
      entree: { etat: etat('2026-10-30', DEUX_RDV), appareils: APPAREILS, modelesOffre: OFFRE },
      attendu: ['DUREE_NON_ATTEINTE'],
    },
    {
      cas: 'un seul rendez-vous',
      entree: {
        etat: etat('2026-10-31', ['2026-10-05']),
        appareils: APPAREILS,
        modelesOffre: OFFRE,
      },
      attendu: ['RDV_MANQUANTS'],
    },
    {
      cas: 'appareil d’un autre modèle que l’offre retenue',
      entree: {
        etat: etat('2026-10-31', DEUX_RDV),
        appareils: APPAREILS,
        modelesOffre: { DROITE: 'modele-b' },
      },
      attendu: ['MODELE_HORS_OFFRE'],
    },
    {
      cas: 'oreille absente de l’offre retenue',
      entree: { etat: etat('2026-10-31', DEUX_RDV), appareils: APPAREILS, modelesOffre: {} },
      attendu: ['MODELE_HORS_OFFRE'],
    },
    {
      cas: 'plusieurs motifs à la fois',
      entree: {
        etat: etat('2026-10-10', []),
        appareils: APPAREILS,
        modelesOffre: { DROITE: 'modele-b' },
      },
      attendu: ['DUREE_NON_ATTEINTE', 'RDV_MANQUANTS', 'MODELE_HORS_OFFRE'],
    },
    {
      cas: 'pas d’essai ouvert',
      entree: { etat: null, appareils: [], modelesOffre: OFFRE },
      attendu: ['ESSAI_ABSENT'],
    },
  ])('$cas', ({ entree, attendu }) => {
    expect(blocagesSignature(entree)).toEqual(attendu);
  });

  it('chaque motif a un message', () => {
    for (const code of CODES_BLOCAGE_SIGNATURE) {
      expect(MESSAGES_BLOCAGE_SIGNATURE[code]).not.toBe('');
    }
  });
});
