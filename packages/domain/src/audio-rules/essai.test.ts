import { describe, expect, it } from 'vitest';

import { etatEssai } from './essai';

const DEBUT = '2026-10-01';
const DEUX_RDV = ['2026-10-05', '2026-10-20'];

describe('etatEssai', () => {
  it.each([
    {
      cas: 'premier jour',
      rdvs: [],
      aujourdhui: '2026-10-01',
      attendu: {
        joursEcoules: 0,
        echeance: '2026-10-31',
        joursRestants: 30,
        rdvRealises: 0,
        facturable: false,
        alertes: [],
      },
    },
    {
      cas: 'essai pas encore commencé',
      rdvs: [],
      aujourdhui: '2026-09-28',
      attendu: {
        joursEcoules: 0,
        echeance: '2026-10-31',
        joursRestants: 33,
        rdvRealises: 0,
        facturable: false,
        alertes: [],
      },
    },
    {
      cas: 'à 8 jours : pas encore d’alerte',
      rdvs: [],
      aujourdhui: '2026-10-23',
      attendu: {
        joursEcoules: 22,
        echeance: '2026-10-31',
        joursRestants: 8,
        rdvRealises: 0,
        facturable: false,
        alertes: [],
      },
    },
    {
      cas: 'à 7 jours, rendez-vous manquants',
      rdvs: ['2026-10-05'],
      aujourdhui: '2026-10-24',
      attendu: {
        joursEcoules: 23,
        echeance: '2026-10-31',
        joursRestants: 7,
        rdvRealises: 1,
        facturable: false,
        alertes: ['ECHEANCE_PROCHE', 'RDV_INSUFFISANTS'],
      },
    },
    {
      cas: 'à 7 jours, rendez-vous faits',
      rdvs: DEUX_RDV,
      aujourdhui: '2026-10-24',
      attendu: {
        joursEcoules: 23,
        echeance: '2026-10-31',
        joursRestants: 7,
        rdvRealises: 2,
        facturable: false,
        alertes: ['ECHEANCE_PROCHE'],
      },
    },
    {
      cas: 'veille de l’échéance : pas facturable',
      rdvs: DEUX_RDV,
      aujourdhui: '2026-10-30',
      attendu: {
        joursEcoules: 29,
        echeance: '2026-10-31',
        joursRestants: 1,
        rdvRealises: 2,
        facturable: false,
        alertes: ['ECHEANCE_PROCHE'],
      },
    },
    {
      cas: 'jour de l’échéance : facturable',
      rdvs: DEUX_RDV,
      aujourdhui: '2026-10-31',
      attendu: {
        joursEcoules: 30,
        echeance: '2026-10-31',
        joursRestants: 0,
        rdvRealises: 2,
        facturable: true,
        alertes: ['ECHEANCE_ATTEINTE'],
      },
    },
    {
      cas: 'échéance atteinte sans les 2 rendez-vous',
      rdvs: ['2026-10-05'],
      aujourdhui: '2026-11-08',
      attendu: {
        joursEcoules: 38,
        echeance: '2026-10-31',
        joursRestants: -8,
        rdvRealises: 1,
        facturable: false,
        alertes: ['ECHEANCE_ATTEINTE', 'RDV_INSUFFISANTS'],
      },
    },
    {
      cas: 'rendez-vous le jour du début : compté ; futur ou antérieur : non',
      rdvs: ['2026-09-30', '2026-10-01', '2026-10-05', '2026-11-20'],
      aujourdhui: '2026-10-31',
      attendu: {
        joursEcoules: 30,
        echeance: '2026-10-31',
        joursRestants: 0,
        rdvRealises: 2,
        facturable: true,
        alertes: ['ECHEANCE_ATTEINTE'],
      },
    },
  ])('$cas', ({ rdvs, aujourdhui, attendu }) => {
    expect(etatEssai({ debut: DEBUT, prolongation: null, rdvs, aujourdhui })).toEqual(attendu);
  });

  it.each([
    {
      cas: 'prolongation de 15 jours sur demande écrite',
      prolongation: { jours: 15, demandeEcrite: true },
      aujourdhui: '2026-10-31',
      echeance: '2026-11-15',
      facturable: false,
      alertes: [],
    },
    {
      cas: 'prolongation de 10 jours, échue',
      prolongation: { jours: 10, demandeEcrite: true },
      aujourdhui: '2026-11-10',
      echeance: '2026-11-10',
      facturable: true,
      alertes: ['ECHEANCE_ATTEINTE'],
    },
    {
      cas: 'sans demande écrite : non retenue',
      prolongation: { jours: 15, demandeEcrite: false },
      aujourdhui: '2026-10-31',
      echeance: '2026-10-31',
      facturable: true,
      alertes: ['PROLONGATION_SANS_DEMANDE_ECRITE', 'ECHEANCE_ATTEINTE'],
    },
    {
      cas: 'au-delà de 15 jours : ramenée à 45 jours au total',
      prolongation: { jours: 20, demandeEcrite: true },
      aujourdhui: '2026-11-15',
      echeance: '2026-11-15',
      facturable: true,
      alertes: ['PROLONGATION_EXCESSIVE', 'ECHEANCE_ATTEINTE'],
    },
  ])('$cas', ({ prolongation, aujourdhui, echeance, facturable, alertes }) => {
    const etat = etatEssai({ debut: DEBUT, prolongation, rdvs: DEUX_RDV, aujourdhui });
    expect(etat.echeance).toBe(echeance);
    expect(etat.facturable).toBe(facturable);
    expect(etat.alertes).toEqual(alertes);
  });
});
