import { FakeClock, FakeDocumentStore, FakeSignatureCaisse, HacheurSha256 } from '@ha/adapters';
import { ajouterMaillon } from '@ha/caisse';
import { prisma, viderBaseJetable } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { enTransaction, executerEnveloppe } from '../travail';
import { travailCaisseNuit } from './caisse-nuit';

const hacheur = new HacheurSha256();
const horloge = new FakeClock('2026-11-02T10:00:00.000+01:00');
const documents = new FakeDocumentStore();
let organisationId: string;
let centreId: string;

function evenementJournalise(): Promise<unknown> {
  return enTransaction(organisationId, async (tx) =>
    ajouterMaillon(
      tx,
      { organisationId, acteurId: null, horloge, hacheur },
      { centreId, type: 'ARCHIVAGE', charge: { essai: true } },
    ),
  );
}

async function activite(): Promise<void> {
  const { id: acteurId } = await prisma().utilisateur.findFirstOrThrow({ select: { id: true } });
  await enTransaction(organisationId, (tx) =>
    ajouterMaillon(
      tx,
      { organisationId, acteurId, horloge, hacheur },
      { centreId, type: 'PARAMETRE_MODIFIE', charge: { parametre: 'ESSAI' } },
    ),
  );
}

function nuit(avecDocuments = true): Promise<void> {
  return executerEnveloppe(
    travailCaisseNuit({
      horloge,
      hacheur,
      signature: new FakeSignatureCaisse(),
      documents: avecDocuments ? documents : null,
    }),
    { organisationId, cleIdempotence: 'caisse-nuit', charge: {} },
  );
}

beforeEach(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
  horloge.regler('2026-11-02T10:00:00.000+01:00');
  ({ id: organisationId } = await prisma().organisation.create({
    data: { raisonSociale: 'Client fictif' },
  }));
  ({ id: centreId } = await prisma().centre.create({
    data: {
      organisationId,
      nom: 'Centre fictif',
      adresseLigne1: '1 rue Fictive',
      codePostal: '75000',
      ville: 'Paris',
      email: 'centre@exemple.test',
      telephone: '0100000000',
    },
  }));
  await prisma().utilisateur.create({
    data: {
      organisationId,
      prenom: 'Ada',
      nom: 'Fictive',
      name: 'Ada Fictive',
      email: 'ada@exemple.test',
      role: 'ASSISTANT',
    },
  });
});

describe('caisse de nuit', () => {
  it('clôture la veille sans acteur, une seule fois', async () => {
    await activite();
    horloge.regler('2026-11-03T00:20:00.000+01:00');
    await nuit();
    await nuit();
    const clotures = await prisma().clotureCaisse.findMany();
    expect(clotures).toHaveLength(1);
    expect(clotures[0]).toMatchObject({ portee: 'JOUR', acteurId: null, cleId: 'simulation' });
    expect(await prisma().evenementCaisse.count({ where: { type: 'VERIFICATION_ECHEC' } })).toBe(0);
  });

  it('rattrape après une panne, clôture le mois et l’archive', async () => {
    await activite();
    horloge.regler('2026-12-03T00:20:00.000+01:00');
    await nuit();
    await expect(prisma().clotureCaisse.count({ where: { portee: 'MOIS' } })).resolves.toBe(1);
    const archive = await prisma().archiveCaisse.findFirstOrThrow();
    expect(documents.objets.has(archive.cle)).toBe(true);
    await nuit();
    await expect(prisma().archiveCaisse.count()).resolves.toBe(1);
  });

  it('sans stockage réel, clôture et n’archive pas', async () => {
    await activite();
    horloge.regler('2026-12-03T00:20:00.000+01:00');
    await nuit(false);
    await expect(prisma().clotureCaisse.count()).resolves.toBe(2);
    await expect(prisma().archiveCaisse.count()).resolves.toBe(0);
  });

  it('journalise une chaîne rompue et clôture quand même', async () => {
    await activite();
    await prisma().$executeRawUnsafe('ALTER TABLE "chaine_caisse" DISABLE TRIGGER USER');
    await prisma().chaineCaisse.updateMany({ data: { derniereEmpreinte: 'f'.repeat(64) } });
    await prisma().$executeRawUnsafe('ALTER TABLE "chaine_caisse" ENABLE TRIGGER USER');
    horloge.regler('2026-11-03T00:20:00.000+01:00');
    await nuit();
    await expect(
      prisma().evenementCaisse.count({ where: { type: 'VERIFICATION_ECHEC' } }),
    ).resolves.toBe(1);
    await expect(prisma().clotureCaisse.count()).resolves.toBe(1);
  });

  it('un événement système seul ne fait pas une journée', async () => {
    await evenementJournalise();
    horloge.regler('2026-11-03T00:20:00.000+01:00');
    await nuit();
    await expect(prisma().clotureCaisse.count()).resolves.toBe(0);
  });
});
