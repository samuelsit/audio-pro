import { describe, expect, it } from 'vitest';

import type { FseDraft } from '@ha/domain';

import { FakeBillingEngine } from './fake-billing-engine';

const DRAFT: FseDraft = {
  tiersPayantAmo: true,
  factureId: 'f1',
  numeroFacture: 'FA-000001',
  dateFacture: '2026-11-01',
  beneficiaire: {
    nir: '100000000000000',
    rangNaissance: 1,
    qualite: 'ASSURE',
    nom: 'FICTIF',
    prenoms: 'Jean',
    dateNaissance: '1960-05-12',
    regime: null,
    caisse: null,
    centreGestionnaire: null,
  },
  praticien: {
    nom: 'Audio',
    prenom: 'Alex',
    rpps: '10000000000',
    adeli: null,
    numeroFacturationAm: null,
  },
  prescripteur: { nom: 'ORL', prenom: 'Sam', rpps: '10000000017', datePrescription: '2026-08-01' },
  lignes: [
    {
      codeLpp: '7310442',
      codePrestation: 'P1D',
      oreille: 'DROITE',
      numeroSerie: 'SN-1',
      quantite: 1,
      montantFacture: 95_000,
      baseRemboursement: 40_000,
      amo: 24_000,
      amc: 0,
      resteACharge: 71_000,
    },
  ],
  totaux: { montantFacture: 95_000, amo: 24_000, amc: 0 },
};

describe('FakeBillingEngine', () => {
  it('fait avancer la FSE jusqu’à l’acceptation, puis ne bouge plus', async () => {
    const moteur = new FakeBillingEngine();
    const { reference, statut } = await moteur.soumettre(DRAFT);
    expect(statut).toBe('EN_ATTENTE');
    expect(moteur.recues).toEqual([DRAFT]);
    expect((await moteur.consulter(reference)).statut).toBe('TRANSMISE');
    expect((await moteur.consulter(reference)).statut).toBe('ACCEPTEE');
    expect((await moteur.consulter(reference)).statut).toBe('ACCEPTEE');
  });

  it('rejette d’emblée sans RPPS du prescripteur', async () => {
    const resultat = await new FakeBillingEngine().soumettre({
      ...DRAFT,
      prescripteur: { ...DRAFT.prescripteur, rpps: null },
    });
    expect(resultat).toMatchObject({
      statut: 'REJETEE',
      motif: 'RPPS du prescripteur absent (simulation).',
    });
  });

  it('applique un rejet forcé au dépôt, une seule fois', async () => {
    const moteur = new FakeBillingEngine();
    moteur.prochainRejet = 'Droits fermés (simulation).';
    expect(await moteur.soumettre(DRAFT)).toMatchObject({
      statut: 'REJETEE',
      motif: 'Droits fermés (simulation).',
    });
    expect((await moteur.soumettre(DRAFT)).statut).toBe('EN_ATTENTE');
  });

  it('applique un rejet forcé à la consultation, qui reste acquis', async () => {
    const moteur = new FakeBillingEngine();
    const { reference } = await moteur.soumettre(DRAFT);
    moteur.prochainRejet = 'Code refusé (simulation).';
    expect((await moteur.consulter(reference)).statut).toBe('REJETEE');
    expect(await moteur.consulter(reference)).toMatchObject({
      statut: 'REJETEE',
      motif: 'Code refusé (simulation).',
    });
  });

  it('reprend une référence inconnue, après un redémarrage', async () => {
    const resultat = await new FakeBillingEngine().consulter('SIM-ancienne');
    expect(resultat).toEqual({ reference: 'SIM-ancienne', statut: 'TRANSMISE', motif: null });
  });
});
