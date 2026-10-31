import { randomUUID } from 'node:crypto';

import { chargerTrousseau, ChiffreurAesGcm } from '@ha/adapters';
import { prisma, viderBaseJetable } from '@ha/db/admin';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { FileTravaux } from './file';
import { definirTravail, executerEnveloppe } from './travail';
import { travailDiagnostic } from './travaux/diagnostic';

const file = new FileTravaux(process.env.DATABASE_URL_JOBS ?? '');
let organisationA: string;
let organisationB: string;

function centre(organisationId: string, nom: string) {
  return prisma().centre.create({
    data: {
      organisationId,
      nom,
      adresseLigne1: '1 rue de l’Exemple',
      codePostal: '75000',
      ville: 'Paris',
      email: 'centre@exemple.test',
      telephone: '0100000000',
    },
  });
}

beforeAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
  const a = await prisma().organisation.create({ data: { raisonSociale: 'Client A' } });
  const b = await prisma().organisation.create({ data: { raisonSociale: 'Client B' } });
  organisationA = a.id;
  organisationB = b.id;
  await centre(a.id, 'Centre A1');
  await centre(a.id, 'Centre A2');
  await centre(b.id, 'Centre B1');
  await file.demarrer();
});

afterAll(async () => {
  await file.arreter();
});

function nomUnique(prefixe: string): string {
  return `${prefixe}-${randomUUID()}`;
}

const travailComptage = (nom: string, comptes: Map<string, number>) =>
  definirTravail({
    nom,
    charge: z.object({ libelle: z.string() }),
    async executer({ organisationId, client }) {
      comptes.set(organisationId, await client.centre.count());
    },
  });

describe('exécution', () => {
  it('exécute le travail dans le contexte de son organisation', async () => {
    const comptes = new Map<string, number>();
    const travail = travailComptage(nomUnique('comptage'), comptes);
    await file.declarer(travail);
    await file.envoyer(travail, {
      organisationId: organisationA,
      cleIdempotence: 'a',
      charge: { libelle: 'a' },
    });
    await file.envoyer(travail, {
      organisationId: organisationB,
      cleIdempotence: 'b',
      charge: { libelle: 'b' },
    });
    await file.ecouter(travail, { intervalleSecondes: 0.5 });

    await vi.waitFor(() => expect(comptes.size).toBe(2), { timeout: 15_000, interval: 200 });
    expect(comptes.get(organisationA)).toBe(2);
    expect(comptes.get(organisationB)).toBe(1);
  });

  it('exécute le diagnostic sans rien écrire', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await executerEnveloppe(travailDiagnostic, {
      organisationId: organisationB,
      cleIdempotence: 'diagnostic',
      charge: {},
    });
    expect(info).toHaveBeenCalledWith(`Diagnostic ${organisationB} : 1 centre(s) visibles.`);
  });
});

it('lit les champs chiffrés en clair, comme l’application', async () => {
  const { id: centreId } = await prisma().centre.findFirstOrThrow({
    where: { organisationId: organisationB },
  });
  const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
  const { id: patientId } = await prisma().patient.create({
    data: {
      organisationId: organisationB,
      centreId,
      civilite: 'MME',
      nomNaissance: 'Essai',
      prenoms: 'Camille',
      dateNaissance: new Date('1950-03-15T00:00:00.000Z'),
      sexe: 'FEMININ',
      nomNaissanceRecherche: 'ESSAI',
      prenomsRecherche: 'CAMILLE',
      notes: chiffreur.chiffrer('Note fictive', 'patient.notes'),
    },
  });
  let lue: string | null | undefined;
  const travail = definirTravail({
    nom: 'lecture',
    charge: z.object({}),
    async executer({ client }) {
      const patient = await client.patient.findUniqueOrThrow({ where: { id: patientId } });
      lue = patient.notes;
    },
  });
  await executerEnveloppe(travail, {
    organisationId: organisationB,
    cleIdempotence: 'lecture',
    charge: {},
  });
  expect(lue).toBe('Note fictive');
});

describe('idempotence', () => {
  it('ne met pas deux fois en file la même clé', async () => {
    const travail = travailComptage(nomUnique('doublon'), new Map());
    await file.declarer(travail);
    const enveloppe = {
      organisationId: organisationA,
      cleIdempotence: 'meme-cle',
      charge: { libelle: 'x' },
    };
    expect(await file.envoyer(travail, enveloppe)).toEqual(expect.any(String));
    expect(await file.envoyer(travail, enveloppe)).toBeNull();
    expect(await file.envoyer(travail, { ...enveloppe, cleIdempotence: 'autre-cle' })).toEqual(
      expect.any(String),
    );
  });

  it('une même clé chez deux clients ne se gêne pas', async () => {
    const travail = travailComptage(nomUnique('deux-clients'), new Map());
    await file.declarer(travail);
    const envoyer = (organisationId: string) =>
      file.envoyer(travail, { organisationId, cleIdempotence: 'cle', charge: { libelle: 'x' } });
    expect(await envoyer(organisationA)).toEqual(expect.any(String));
    expect(await envoyer(organisationB)).toEqual(expect.any(String));
  });
});

describe('frontière', () => {
  const travail = travailComptage('jamais-execute', new Map());

  it.each([
    { cas: 'sans organisation', donnees: { cleIdempotence: 'x', charge: { libelle: 'x' } } },
    { cas: 'sans clé', donnees: { organisationId: 'o', charge: { libelle: 'x' } } },
    {
      cas: 'charge invalide',
      donnees: { organisationId: 'o', cleIdempotence: 'x', charge: { libelle: 1 } },
    },
  ])('refuse un travail $cas', async ({ donnees }) => {
    await expect(executerEnveloppe(travail, donnees)).rejects.toThrow();
  });

  it('refuse d’envoyer une charge invalide', async () => {
    await expect(
      file.envoyer(travail, { organisationId: 'o', cleIdempotence: 'x', charge: { libelle: 1 } }),
    ).rejects.toThrow();
  });
});
