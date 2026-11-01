import type { DemandePec } from '@ha/domain';
import { describe, expect, it } from 'vitest';

import { FakePecGateway } from './fake-pec-gateway';

const demande = (numeroAdherent: string | null): DemandePec => ({
  dossierId: 'd1',
  organismeIdentifiant: '99999997',
  organisme: 'Mutuelle Démo',
  numeroAdherent,
  lignes: [
    {
      libelle: 'Aide droite',
      codeLpp: null,
      prixTtcCentimes: 150_000,
      amoCentimes: 24_000,
      montantDemandeCentimes: 71_000,
    },
  ],
});

describe('FakePecGateway', () => {
  it.each([
    ['accord total', 'A5', 'ACCORDEE', 71_000],
    ['sans numéro', null, 'ACCORDEE', 71_000],
    ['refus', 'A0', 'REFUSEE', null],
    ['accord partiel', 'A1', 'PARTIELLE', 35_500],
    ['en attente', 'A2', 'DEMANDEE', null],
  ])('%s', async (_, numero, statut, montant) => {
    const reponse = await new FakePecGateway().demander(demande(numero));
    expect(reponse).toMatchObject({ statut, montantAccordeCentimes: montant });
  });

  it('une demande en attente est accordée à la consultation', async () => {
    const pec = new FakePecGateway();
    const { reference } = await pec.demander(demande('A2'));
    await expect(pec.consulter(reference)).resolves.toMatchObject({
      statut: 'ACCORDEE',
      montantAccordeCentimes: 71_000,
    });
    await expect(pec.consulter(reference)).resolves.toMatchObject({ statut: 'ACCORDEE' });
  });

  it('une référence inconnue reste en attente', async () => {
    await expect(new FakePecGateway().consulter('X')).resolves.toMatchObject({
      statut: 'DEMANDEE',
    });
  });

  it('force la prochaine réponse, une seule fois', async () => {
    const pec = new FakePecGateway();
    pec.prochaineReponse = { statut: 'REFUSEE', montantAccordeCentimes: null, motif: 'Forcé' };
    await expect(pec.demander(demande('A5'))).resolves.toMatchObject({
      statut: 'REFUSEE',
      numeroAccord: null,
      motif: 'Forcé',
    });
    await expect(pec.demander(demande('A5'))).resolves.toMatchObject({ statut: 'ACCORDEE' });
  });

  it('force aussi un accord, avec son numéro', async () => {
    const pec = new FakePecGateway();
    pec.prochaineReponse = { statut: 'PARTIELLE', montantAccordeCentimes: 100, motif: null };
    const reponse = await pec.demander(demande('A5'));
    expect(reponse.numeroAccord).toContain('SIM-ACC');
  });

  it('garde les demandes reçues', async () => {
    const pec = new FakePecGateway();
    await pec.demander(demande('A5'));
    expect(pec.recues).toHaveLength(1);
  });
});
