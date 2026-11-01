import { FakeBoiteFactures, FakeDocumentStore, FakeExtracteurFacture } from '@ha/adapters';
import { prisma, viderBaseJetable } from '@ha/db/admin';
import { FACTURE_VIDE } from '@ha/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { executerEnveloppe } from '../travail';
import { travailReleveFactures } from './relever-factures';

const ADRESSE = 'factures@client.exemple.test';
const PDF = Buffer.from('%PDF-1.7 facture');

let organisationId: string;
let centreId: string;
let fournisseurId: string;
let boite: FakeBoiteFactures;
let documents: FakeDocumentStore;

function relever(extraite = FACTURE_VIDE) {
  return executerEnveloppe(
    travailReleveFactures({
      boite,
      documents,
      extracteur: new FakeExtracteurFacture(extraite),
    }),
    { organisationId, cleIdempotence: 'releve', charge: {} },
  );
}

const message = (
  identifiant = 'm1',
  contenu: Uint8Array = PDF,
  expediteur = 'factures@f.exemple.test',
) => ({
  identifiant,
  expediteur,
  pieces: [{ nomFichier: 'facture.pdf', contenu }],
});

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
      siret: '22222222200011',
    },
  });
  centreId = centre.id;
  const fournisseur = await prisma().fournisseur.create({
    data: {
      organisationId,
      type: 'FOURNISSEUR',
      nom: 'Fournisseur fictif',
      emailFacturation: 'factures@f.exemple.test',
    },
  });
  fournisseurId = fournisseur.id;
});

beforeEach(async () => {
  boite = new FakeBoiteFactures();
  documents = new FakeDocumentStore();
  await prisma()
    .$executeRaw`ALTER TABLE facture_fournisseur DISABLE TRIGGER facture_fournisseur_figee`;
  await prisma()
    .$executeRaw`ALTER TABLE facture_fournisseur_ligne DISABLE TRIGGER facture_fournisseur_ligne_figee`;
  await prisma().factureFournisseurLigne.deleteMany();
  await prisma().factureFournisseur.deleteMany();
  await prisma()
    .$executeRaw`ALTER TABLE facture_fournisseur ENABLE TRIGGER facture_fournisseur_figee`;
  await prisma()
    .$executeRaw`ALTER TABLE facture_fournisseur_ligne ENABLE TRIGGER facture_fournisseur_ligne_figee`;
  await prisma().parametresCommande.deleteMany();
  await prisma().parametresCommande.create({
    data: {
      organisationId,
      delaiRelanceJours: 3,
      relancesMax: 2,
      tolerancePrixCentimes: 0,
      adresseBoiteFactures: ADRESSE,
    },
  });
});

afterAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
});

describe('relève de la boîte', () => {
  it('fait entrer la facture à valider, centre lu sur la facture, et acquitte le message', async () => {
    boite.deposer(ADRESSE, message());
    await relever({
      ...FACTURE_VIDE,
      numero: 'FA-1',
      dateFacture: '2030-01-07',
      sirets: ['22222222200011'],
      lignes: [
        {
          reference: null,
          designation: 'Aurore',
          quantite: 1,
          prixUnitaireCentimes: 100,
          numerosSerie: ['SN1'],
        },
      ],
    });

    const facture = await prisma().factureFournisseur.findFirstOrThrow({
      include: { lignes: true },
    });
    expect(facture).toMatchObject({
      statut: 'A_VALIDER',
      origine: 'EMAIL',
      numero: 'FA-1',
      fournisseurId,
      centreId,
      expediteurInconnu: false,
      identifiantExterne: 'm1:0',
    });
    expect(facture.lignes[0]?.designation).toMatch(/^v1\./);
    expect(Buffer.from(await documents.get(facture.documentCle))).toEqual(PDF);
    expect(await boite.relever(ADRESSE)).toEqual([]);
  });

  it('rejouée, ne crée pas de doublon, même pour un autre message du même fichier', async () => {
    boite.deposer(ADRESSE, message('m1'));
    await relever();
    boite.deposer(ADRESSE, message('m1'));
    boite.deposer(ADRESSE, message('m2'));
    await relever();
    expect(await prisma().factureFournisseur.count()).toBe(1);
    expect(await boite.relever(ADRESSE)).toEqual([]);
  });

  it('un expéditeur inconnu entre quand même, signalé', async () => {
    boite.deposer(ADRESSE, message('m1', PDF, 'inconnu@exemple.test'));
    await relever();
    const facture = await prisma().factureFournisseur.findFirstOrThrow();
    expect(facture).toMatchObject({ expediteurInconnu: true, fournisseurId: null });
  });

  it('un message sans PDF reste dans la boîte', async () => {
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    boite.deposer(ADRESSE, message('m1', Buffer.from('<html>')));
    await relever();
    expect(await prisma().factureFournisseur.count()).toBe(0);
    expect(await boite.relever(ADRESSE)).toHaveLength(1);
    expect(avertir).toHaveBeenCalledOnce();
    avertir.mockRestore();
  });

  it('sans adresse, rien ne se relève', async () => {
    await prisma().parametresCommande.deleteMany();
    boite.deposer(ADRESSE, message());
    await relever();
    expect(await boite.relever(ADRESSE)).toHaveLength(1);
  });
});
