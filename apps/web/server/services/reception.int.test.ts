import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { ErreurSaisie } from '../erreurs';
import { receptionnerDansTransaction, receptionner, type ResultatReception } from './reception';

let d: JeuDeDonnees;
let admin: UtilisateurConnecte;
let modeleA: string;
let modeleB: string;
let accessoireId: string;

const COMMANDE = '0192f0a0-0000-7000-8000-00000000c0de';

async function creerModele(fabricantId: string, nom: string): Promise<string> {
  const modele = await prisma().modeleAideAuditive.create({
    data: {
      organisationId: d.organisation.id,
      fabricantId,
      gamme: 'Gamme',
      nom,
      type: 'RIC',
      classe: 'CLASSE_II',
      prixConseilleCentimes: 150000,
    },
  });
  return modele.id;
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ admin } = d.acteurs);
  const fabricant = await prisma().fabricant.create({
    data: { organisationId: d.organisation.id, nom: 'Fabricant' },
  });
  modeleA = await creerModele(fabricant.id, 'Alpha');
  modeleB = await creerModele(fabricant.id, 'Beta');
  const accessoire = await prisma().accessoire.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Piles 312',
      nature: 'PILE',
      prixCentimes: 500,
    },
  });
  accessoireId = accessoire.id;
});

function livraison(autres: Record<string, unknown> = {}) {
  return {
    centreId: d.centres.a.id,
    dateReception: '2026-01-15',
    referenceBonLivraison: 'BL-1',
    referenceFactureFabricant: null,
    commandeId: COMMANDE,
    appareils: [
      {
        modeleId: modeleA,
        numerosSerie: ['SN1', 'SN2'],
        prixAchatCentimes: 65000,
        enConsignation: false,
      },
      { modeleId: modeleB, numerosSerie: ['SN3'], prixAchatCentimes: null, enConsignation: true },
    ],
    accessoires: [{ accessoireId, quantite: 12, motif: 'Livraison' }],
    ...autres,
  };
}

describe('receptionner', () => {
  it('enregistre plusieurs modèles et accessoires, liés à la commande', async () => {
    const { appareilIds, evenements } = await receptionner(admin, livraison());
    expect(appareilIds).toHaveLength(3);
    expect(evenements).toHaveLength(4);

    const appareils = await prisma().appareil.findMany({ orderBy: { numeroSerie: 'asc' } });
    expect(appareils.map((a) => [a.numeroSerie, a.modeleId, a.prixAchatCentimes])).toEqual([
      ['SN1', modeleA, 65000],
      ['SN2', modeleA, 65000],
      ['SN3', modeleB, null],
    ]);
    const mouvements = await prisma().mouvementAppareil.findMany();
    expect(mouvements.map((m) => [m.type, m.commandeId])).toEqual([
      ['RECEPTION', COMMANDE],
      ['RECEPTION', COMMANDE],
      ['RECEPTION', COMMANDE],
    ]);
    const entree = await prisma().mouvementAccessoire.findFirstOrThrow();
    expect(entree).toMatchObject({ type: 'ENTREE', quantite: 12, commandeId: COMMANDE });
    const stock = await prisma().stockAccessoire.findFirstOrThrow();
    expect(stock.quantite).toBe(12);
  });

  it('accepte une réception sans commande', async () => {
    await receptionner(admin, livraison({ commandeId: null, accessoires: [] }));
    const mouvement = await prisma().mouvementAppareil.findFirstOrThrow();
    expect(mouvement.commandeId).toBeNull();
  });

  it('refuse une livraison vide', async () => {
    await expect(
      receptionner(admin, livraison({ appareils: [], accessoires: [] })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('refuse un centre hors périmètre', async () => {
    const { assistantB } = d.acteurs;
    await expect(
      receptionner(assistantB, livraison({ centreId: d.centres.a.id })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse une date future', async () => {
    await expect(receptionner(admin, livraison({ dateReception: '2999-01-01' }))).rejects.toThrow(
      ErreurSaisie,
    );
  });

  it('un numéro déjà connu annule toute la livraison', async () => {
    await receptionner(admin, livraison());
    await expect(receptionner(admin, livraison())).rejects.toMatchObject({
      erreurs: { numerosSerie: expect.any(Array) as string[] },
    });
    expect(await prisma().appareil.count()).toBe(3);
    const stock = await prisma().stockAccessoire.findFirstOrThrow();
    expect(stock.quantite).toBe(12);
  });

  it('refuse un modèle ou un accessoire inconnu', async () => {
    const inconnu = '0192f0a0-0000-7000-8000-00000000dead';
    await expect(
      receptionner(
        admin,
        livraison({
          appareils: [
            {
              modeleId: inconnu,
              numerosSerie: ['SN9'],
              prixAchatCentimes: null,
              enConsignation: false,
            },
          ],
        }),
      ),
    ).rejects.toThrow(ErreurSaisie);
    await expect(
      receptionner(
        admin,
        livraison({ accessoires: [{ accessoireId: inconnu, quantite: 1, motif: 'Livraison' }] }),
      ),
    ).rejects.toThrow(ErreurSaisie);
  });
});

describe('receptionnerDansTransaction', () => {
  it('suit la transaction de l’appelant : tout est annulé si elle échoue', async () => {
    await expect(
      withAudit(
        admin,
        async (tx): Promise<ResultatReception> => {
          await receptionnerDansTransaction(tx, admin, livraison());
          throw new Error('La mise à jour de la commande a échoué.');
        },
        ({ evenements }) => evenements,
      ),
    ).rejects.toThrow('La mise à jour de la commande a échoué.');
    expect(await prisma().appareil.count()).toBe(0);
    expect(await prisma().mouvementAppareil.count()).toBe(0);
    expect(await prisma().stockAccessoire.count()).toBe(0);
  });
});
