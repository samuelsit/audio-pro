import { randomUUID } from 'node:crypto';

import { prisma, viderBaseJetable } from '@ha/db/admin';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileTravaux } from '../file';
import { executerEnveloppe } from '../travail';
import { repartirDiffusion, travailDiffusion, type Abonne } from './diffuser-evenements';

const file = new FileTravaux(process.env.DATABASE_URL_JOBS ?? '');
let organisationA: string;
let organisationB: string;

function charge(rendezVousId: string) {
  return {
    rendezVousId,
    centreId: 'c1',
    typeRdvId: 't1',
    patientId: null,
    dossierId: null,
    praticienId: 'p1',
    cabineId: null,
    debut: '2030-01-07T08:00:00.000Z',
    fin: '2030-01-07T08:30:00.000Z',
  };
}

function evenement(organisationId: string, rendezVousId: string) {
  return prisma().evenementDomaine.create({
    data: {
      id: randomUUID(),
      organisationId,
      type: 'RDV_CREE',
      agregatId: rendezVousId,
      charge: charge(rendezVousId),
      survenuLe: new Date('2030-01-01T00:00:00.000Z'),
    },
  });
}

function diffuser(abonnes: readonly Abonne[], organisationId = organisationA) {
  return executerEnveloppe(travailDiffusion(abonnes), {
    organisationId,
    cleIdempotence: 'diffusion',
    charge: {},
  });
}

function aDiffuser(organisationId = organisationA) {
  return prisma().evenementDomaine.count({ where: { organisationId, diffuseLe: null } });
}

beforeAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
  organisationA = (await prisma().organisation.create({ data: { raisonSociale: 'Client A' } })).id;
  organisationB = (await prisma().organisation.create({ data: { raisonSociale: 'Client B' } })).id;
  await file.demarrer();
});

afterAll(async () => {
  await file.arreter();
});

beforeEach(async () => {
  await prisma().evenementDomaine.deleteMany();
});

describe('travailDiffusion', () => {
  it('diffuse une fois, dans l’ordre, chez le seul client du contexte', async () => {
    const recus: string[] = [];
    const abonne: Abonne = {
      nom: 'test',
      traiter: async (e) => {
        recus.push(e.charge.rendezVousId);
        await Promise.resolve();
      },
    };
    await evenement(organisationA, 'r1');
    await evenement(organisationB, 'r2');
    await diffuser([abonne]);
    await diffuser([abonne]);
    expect(recus).toEqual(['r1']);
    expect(await aDiffuser(organisationA)).toBe(0);
    expect(await aDiffuser(organisationB)).toBe(1);
  });

  it('un abonné en échec laisse l’événement à diffuser, puis il est rejoué', async () => {
    await evenement(organisationA, 'r1');
    const traiter = vi
      .fn<Abonne['traiter']>()
      .mockRejectedValueOnce(new Error('panne'))
      .mockResolvedValue();
    await expect(diffuser([{ nom: 'test', traiter }])).rejects.toThrow('panne');
    expect(await aDiffuser()).toBe(1);
    await diffuser([{ nom: 'test', traiter }]);
    expect(traiter).toHaveBeenCalledTimes(2);
    expect(await aDiffuser()).toBe(0);
  });

  it('sans abonné, l’événement est marqué diffusé', async () => {
    await evenement(organisationA, 'r1');
    await diffuser([]);
    expect(await aDiffuser()).toBe(0);
  });

  it('refuse un événement illisible plutôt que de le marquer diffusé', async () => {
    await prisma().evenementDomaine.create({
      data: {
        organisationId: organisationA,
        type: 'INCONNU',
        agregatId: 'r1',
        charge: {},
        survenuLe: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    await expect(diffuser([])).rejects.toThrow();
    expect(await aDiffuser()).toBe(1);
  });
});

describe('repartirDiffusion', () => {
  it('ne met en file que les organisations en attente', async () => {
    const travail = travailDiffusion([]);
    await file.declarer(travail);
    await evenement(organisationB, 'r1');
    await evenement(organisationB, 'r2');
    const envoyer = vi.spyOn(file, 'envoyer');
    await repartirDiffusion(file, travail);
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0]?.[1]).toMatchObject({ organisationId: organisationB });
    envoyer.mockRestore();
  });

  it('la diffusion mise en file s’exécute', async () => {
    const travail = travailDiffusion([]);
    await file.declarer(travail);
    await file.ecouter(travail, { intervalleSecondes: 0.5 });
    await evenement(organisationA, 'r1');
    await repartirDiffusion(file, travail);
    await vi.waitFor(async () => expect(await aDiffuser()).toBe(0), {
      timeout: 15_000,
      interval: 200,
    });
  });
});

describe('planifierTransverse', () => {
  it('inscrit la planification', async () => {
    const nom = `transverse-${randomUUID()}`;
    await file.planifierTransverse(nom, '* * * * *', () => Promise.resolve());
    const lignes = await prisma().$queryRaw<{ cron: string }[]>`
      SELECT cron FROM pgboss.schedule WHERE name = ${nom}`;
    expect(lignes).toEqual([{ cron: '* * * * *' }]);
  });
});
