import {
  FakeDocumentStore,
  FakeNotifier,
  SignatureLienCommande,
  SignatureLienDocument,
  SignatureLienRdv,
} from '@ha/adapters';
import { prisma, viderBaseJetable } from '@ha/db/admin';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { executerEnveloppe } from '../travail';
import { travailEnvoi } from './envoyer-notifications';
import { travailRelanceCommandes } from './relancer-commandes';

const CLE = Buffer.alloc(32, 3);
const signatureCommande = new SignatureLienCommande(CLE);
const JOUR = 86_400_000;
const INSTANT = new Date('2030-01-07T09:00:00.000Z');

let organisationId: string;
let centreId: string;
let fournisseurId: string;
let demandeurId: string;
let commandeId: string;
let notifier: FakeNotifier;
let documents: FakeDocumentStore;
let compteur = 0;

function envoyer(store: FakeDocumentStore | null, maintenant = () => INSTANT) {
  const travail = travailEnvoi({
    notifier,
    signature: new SignatureLienRdv(CLE),
    signatureDocument: new SignatureLienDocument(CLE),
    signatureCommande,
    documents: store,
    urlPublique: 'https://exemple.test',
    maintenant,
  });
  return executerEnveloppe(travail, { organisationId, cleIdempotence: 'envoi', charge: {} });
}

function relancer(maintenant: Date) {
  return executerEnveloppe(travailRelanceCommandes({ maintenant: () => maintenant }), {
    organisationId,
    cleIdempotence: 'relance',
    charge: {},
  });
}

async function commandeEnvoyee(changements: Record<string, unknown> = {}) {
  compteur += 1;
  const { id } = await prisma().commande.create({
    data: {
      organisationId,
      centreId,
      fournisseurId,
      demandeurId,
      numero: `CMD-2030-${String(compteur).padStart(6, '0')}`,
      statut: 'ENVOYEE',
      bonPdfCle: `bons-commande/${String(compteur)}`,
      ...changements,
    },
  });
  await documents.put(`bons-commande/${String(compteur)}`, Uint8Array.from([1, 2, 3]));
  await prisma().notification.create({
    data: {
      organisationId,
      commandeId: id,
      canal: 'EMAIL',
      destinataire: 'v1.non-lu',
      gabarit: 'BON_COMMANDE',
      parametres: { numero: 'CMD', centre: 'Centre A' },
      cleIdempotence: `commande:${id}`,
      statut: 'ENVOYEE',
      envoyeeLe: INSTANT,
    },
  });
  return id;
}

/** Message dû, écrit par le client de l'application pour que le destinataire soit chiffré. */
async function messageDu(id: string, cle = `commande-du:${id}`) {
  const { definirTravail } = await import('../travail');
  const { z } = await import('zod');
  await executerEnveloppe(
    definirTravail({
      nom: 'preparation',
      charge: z.object({}),
      async executer({ client }) {
        await client.notification.create({
          data: {
            commandeId: id,
            canal: 'EMAIL',
            destinataire: 'commandes@fabricant.exemple.test',
            gabarit: 'BON_COMMANDE',
            parametres: { numero: 'CMD-2030-000001', centre: 'Centre A' },
            cleIdempotence: cle,
          },
        });
      },
    }),
    { organisationId, cleIdempotence: 'preparation', charge: {} },
  );
}

beforeAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
  const organisation = await prisma().organisation.create({ data: { raisonSociale: 'Client A' } });
  organisationId = organisation.id;
  const centre = await prisma().centre.create({
    data: {
      organisationId,
      nom: 'Centre A',
      adresseLigne1: '1 rue de l’Exemple',
      codePostal: '75000',
      ville: 'Paris',
      email: 'centre@exemple.test',
      telephone: '0100000000',
    },
  });
  centreId = centre.id;
  const utilisateur = await prisma().utilisateur.create({
    data: {
      organisationId,
      prenom: 'Admin',
      nom: 'Test',
      name: 'Admin Test',
      email: 'admin-commandes@exemple.test',
      role: 'ADMIN_CLIENT',
    },
  });
  demandeurId = utilisateur.id;
  const fournisseur = await prisma().fournisseur.create({
    data: {
      organisationId,
      type: 'FOURNISSEUR',
      nom: 'Fournisseur fictif',
      emailCommande: 'commandes@fabricant.exemple.test',
    },
  });
  fournisseurId = fournisseur.id;
});

beforeEach(async () => {
  notifier = new FakeNotifier();
  documents = new FakeDocumentStore();
  await prisma().notification.deleteMany({ where: { commandeId: { not: null } } });
  await prisma().commande.deleteMany();
  await prisma().parametresCommande.deleteMany();
  await prisma().fournisseur.update({
    where: { id: fournisseurId },
    data: { delaiRelanceJours: null, emailCommande: 'commandes@fabricant.exemple.test' },
  });
  commandeId = await commandeEnvoyee();
});

afterAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
});

describe('envoi du bon', () => {
  it('joint le PDF, répond au centre et donne un lien d’accusé valide', async () => {
    await messageDu(commandeId);
    await envoyer(documents);

    const message = notifier.envoyes.at(-1);
    expect(message).toMatchObject({
      canal: 'EMAIL',
      destinataire: 'commandes@fabricant.exemple.test',
      repondreA: 'centre@exemple.test',
    });
    if (message?.canal !== 'EMAIL') {
      throw new Error('E-mail attendu.');
    }
    expect(message.piecesJointes?.[0]?.contenu).toEqual(Uint8Array.from([1, 2, 3]));
    const jeton = /commande-accuse\/(\S+)/.exec(message.texte)?.[1] ?? '';
    expect(signatureCommande.lire(jeton)).toEqual({ organisationId, commandeId });
  });

  it('sans stockage réel, le message attend au lieu de partir sans pièce jointe', async () => {
    await messageDu(commandeId);
    await envoyer(null);
    expect(notifier.envoyes).toHaveLength(0);
    const ligne = await prisma().notification.findUniqueOrThrow({
      where: {
        organisationId_cleIdempotence: {
          organisationId,
          cleIdempotence: `commande-du:${commandeId}`,
        },
      },
    });
    expect(ligne).toMatchObject({ statut: 'A_ENVOYER', tentatives: 0 });
  });

  it('un fichier perdu compte comme un échec, sans message', async () => {
    await messageDu(commandeId);
    await documents.delete(`bons-commande/${String(compteur)}`);
    await envoyer(documents);
    expect(notifier.envoyes).toHaveLength(0);
  });
});

describe('relance', () => {
  const dansJours = (jours: number) => new Date(INSTANT.getTime() + jours * JOUR);
  const relances = () =>
    prisma().notification.count({ where: { commandeId, gabarit: 'RELANCE_COMMANDE' } });

  it('ne relance pas avant le délai', async () => {
    await relancer(dansJours(2));
    expect(await relances()).toBe(0);
  });

  it('relance au délai, une seule fois même rejouée', async () => {
    await relancer(dansJours(3));
    await relancer(dansJours(3));
    expect(await relances()).toBe(1);
    const { relances: compte } = await prisma().commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    expect(compte).toBe(1);
  });

  it('une exécution interrompue reprend sans doubler le message', async () => {
    await relancer(dansJours(3));
    await prisma().commande.update({ where: { id: commandeId }, data: { relances: 0 } });
    await relancer(dansJours(3));
    expect(await relances()).toBe(1);
  });

  it('s’arrête au plafond du client', async () => {
    await prisma().parametresCommande.create({
      data: {
        organisationId,
        delaiRelanceJours: 1,
        relancesMax: 1,
        tolerancePrixCentimes: 0,
      },
    });
    await relancer(dansJours(2));
    await relancer(dansJours(4));
    expect(await relances()).toBe(1);
  });

  it('le délai du fournisseur remplace celui du client', async () => {
    await prisma().fournisseur.update({
      where: { id: fournisseurId },
      data: { delaiRelanceJours: 10 },
    });
    await relancer(dansJours(3));
    expect(await relances()).toBe(0);
  });

  it('un accusé, une réception ou une adresse retirée arrêtent la relance', async () => {
    await prisma().commande.update({
      where: { id: commandeId },
      data: { accuseLe: INSTANT, accuseOrigine: 'LIEN' },
    });
    await relancer(dansJours(3));
    expect(await relances()).toBe(0);

    await prisma().commande.update({
      where: { id: commandeId },
      data: { accuseLe: null, accuseOrigine: null, statut: 'PARTIELLEMENT_RECUE' },
    });
    await relancer(dansJours(3));
    expect(await relances()).toBe(0);

    await prisma().commande.update({ where: { id: commandeId }, data: { statut: 'ENVOYEE' } });
    await prisma().fournisseur.update({
      where: { id: fournisseurId },
      data: { emailCommande: null },
    });
    await relancer(dansJours(3));
    expect(await relances()).toBe(0);
  });

  it('sans envoi réel, rien ne se relance', async () => {
    await prisma().notification.updateMany({
      where: { commandeId },
      data: { statut: 'A_ENVOYER', envoyeeLe: null },
    });
    await relancer(dansJours(30));
    expect(await relances()).toBe(0);
  });
});
