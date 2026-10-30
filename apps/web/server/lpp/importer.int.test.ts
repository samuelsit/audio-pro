import path from 'node:path';

import { prisma } from '@ha/db';
import { ErreurImportLpp } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { viderBase } from '@/test/donnees';

import { decrireCodesLpp, derniereVersionLpp, tarifsAudioEnVigueur } from '../services/lpp';
import { importerLpp } from './importer';

const FIXTURES = path.join(import.meta.dirname, '../../../../fixtures/lpp');
const V907 = path.join(FIXTURES, '907');
const V908 = path.join(FIXTURES, '908');

async function compter() {
  const db = prisma();
  return {
    versions: await db.lppVersion.count(),
    codes: await db.lppCode.count(),
    fiches: await db.lppFiche.count(),
    tarifs: await db.lppTarif.count(),
    liens: await db.lppLien.count(),
  };
}

async function tarif(code: string, date: string, version?: number) {
  const [decrit] = await decrireCodesLpp([code], { date, ...(version ? { version } : {}) });
  return decrit?.tarif?.baseRemboursementCentimes ?? null;
}

beforeEach(async () => {
  await viderBase();
});

describe('importerLpp', () => {
  it('importe l’extrait : chapitre seul, comp et incomp en entier', async () => {
    const resume = await importerLpp(V908);

    expect(resume).toEqual({
      version: 908,
      dateFichiers: '2026-10-29',
      codes: 35,
      tarifs: 37,
      compatibilites: 3,
      incompatibilites: 5,
      codesLies: 14,
      remplacee: false,
    });
    expect(await compter()).toEqual({ versions: 1, codes: 35, fiches: 35, tarifs: 37, liens: 8 });
    // Hors chapitre : optique, implant cochléaire.
    expect(await prisma().lppCode.count({ where: { code: { in: ['7214164', '3400869'] } } })).toBe(
      0,
    );
  });

  it('stocke les champs de la fiche et de l’historique', async () => {
    await importerLpp(V908);

    const fiche = await prisma().lppFiche.findUniqueOrThrow({
      where: { versionNumero_code: { versionNumero: 908, code: '7336200' } },
    });
    expect(fiche).toMatchObject({
      libelle: 'AIDE AUDITIVE, CLASSE I, DROITE, > 20 ANS,SIVANTOS',
      dateFin: null,
      ageMax: 0,
      typePrestation: 'A',
      indication: 'N',
      oldCode: '2351057',
      codeGenerique: '2351057',
      rmo: [],
    });
    expect(fiche.arbo.slice(0, 3)).toEqual([2, 3, 7]);
    expect(fiche.brut).toMatchObject({ CODE_TIPS: '7336200', PLACE: expect.any(String) });

    const [classeI] = await decrireCodesLpp(['7336200'], { date: '2026-10-30' });
    expect(classeI?.tarif).toEqual({
      naturePrestation: 'P1D',
      baseRemboursementCentimes: 40_000,
      prixLimiteVenteCentimes: 95_000,
      debutValidite: '2023-07-07',
      finValidite: null,
    });
  });

  it('classe II : pas de prix limite (PUREGLEMEN à 0)', async () => {
    await importerLpp(V908);
    const [classeII] = await decrireCodesLpp(['2392530'], { date: '2026-10-30' });
    expect(classeII?.tarif).toMatchObject({
      naturePrestation: 'RJT',
      baseRemboursementCentimes: 40_000,
      prixLimiteVenteCentimes: null,
    });
  });

  it('ne relie un code à un générique que s’il est spécifique', async () => {
    await importerLpp(V908);
    const fiches = await prisma().lppFiche.findMany({
      where: { code: { in: ['2344100', '2351548', '7322675'] } },
      select: { code: true, oldCode: true, codeGenerique: true },
      orderBy: { code: 'asc' },
    });
    expect(fiches).toEqual([
      { code: '2344100', oldCode: '203C01', codeGenerique: null },
      { code: '2351548', oldCode: '203A', codeGenerique: null },
      { code: '7322675', oldCode: '2351057', codeGenerique: '2351057' },
    ]);
  });

  it('un réimport de la même version ne crée aucun doublon', async () => {
    const premier = await importerLpp(V908);
    const avant = await compter();

    const second = await importerLpp(V908);

    expect(second).toEqual({ ...premier, remplacee: true });
    expect(await compter()).toEqual(avant);
  });

  it('un import refusé n’écrit rien', async () => {
    await expect(importerLpp(FIXTURES)).rejects.toThrow(ErreurImportLpp);
    expect(await compter()).toEqual({ versions: 0, codes: 0, fiches: 0, tarifs: 0, liens: 0 });
  });
});

describe('historisation', () => {
  // 2381242 passe de 3 796,81 € à 3 719,64 € le 03/07/2026 dans la 908 ; pas encore dans la 907 synthétique.
  it('le tarif suit la date d’effet', async () => {
    await importerLpp(V908);

    expect(await tarif('2381242', '2023-11-26')).toBeNull();
    expect(await tarif('2381242', '2026-07-02')).toBe(379_681);
    expect(await tarif('2381242', '2026-07-03')).toBe(371_964);
  });

  it('une nouvelle version change le tarif sans effacer la précédente', async () => {
    await importerLpp(V907);
    expect(await derniereVersionLpp()).toBe(907);
    expect(await tarif('2381242', '2026-08-01')).toBe(379_681);

    await importerLpp(V908);

    expect(await derniereVersionLpp()).toBe(908);
    expect(await tarif('2381242', '2026-08-01')).toBe(371_964);
    expect(await tarif('2381242', '2026-07-02')).toBe(379_681);
    expect(await tarif('2381242', '2026-08-01', 907)).toBe(379_681);
    expect(await compter()).toMatchObject({ versions: 2, codes: 35 });
  });

  it('une version ancienne importée après coup ne remplace pas la dernière', async () => {
    await importerLpp(V908);
    await importerLpp(V907);

    expect(await derniereVersionLpp()).toBe(908);
    expect(await tarif('2381242', '2026-08-01')).toBe(371_964);
    const code = await prisma().lppCode.findUniqueOrThrow({ where: { code: '2381242' } });
    expect(code.derniereVersion).toBe(908);
  });

  it('un code disparu d’une version reste référencé', async () => {
    await importerLpp(V908);
    await importerLpp(V907);
    const code = await prisma().lppCode.findUniqueOrThrow({ where: { code: '7322675' } });
    expect(code.derniereVersion).toBe(908);
    const [decrit] = await decrireCodesLpp(['7322675'], { date: '2026-08-01', version: 907 });
    expect(decrit).toEqual({ code: '7322675', libelle: null, codeGenerique: null, tarif: null });
  });

  it('la date de fin de la fiche ferme un historique resté ouvert', async () => {
    await importerLpp(V908);
    // Liste nominative : fin le 22/09/2004 dans la fiche, ligne ouverte dans l'historique.
    expect(await tarif('2332901', '2004-09-22')).not.toBeNull();
    expect(await tarif('2332901', '2004-09-23')).toBeNull();
  });
});

describe('decrireCodesLpp', () => {
  it('sans base importée, le code n’est pas décrit', async () => {
    expect(await derniereVersionLpp()).toBeNull();
    expect(await decrireCodesLpp(['2351057'])).toEqual([
      { code: '2351057', libelle: null, codeGenerique: null, tarif: null },
    ]);
  });

  it('prend la date du jour par défaut', async () => {
    await importerLpp(V908);
    const [decrit] = await decrireCodesLpp(['7336200']);
    expect(decrit?.tarif?.baseRemboursementCentimes).toBe(40_000);
  });
});

describe('tarifsAudioEnVigueur', () => {
  it('lit le prix limite et la base des deux tranches dans la base importée', async () => {
    await importerLpp(V908);

    expect(await tarifsAudioEnVigueur('2026-10-30')).toEqual({
      VINGT_ET_PLUS: { baseRemboursement: 40_000, prixLimiteClasseI: 95_000 },
      MOINS_DE_20: { baseRemboursement: 140_000, prixLimiteClasseI: 140_000 },
    });
  });

  it('renvoie null avant la première ligne de ces codes', async () => {
    await importerLpp(V908);

    expect(await tarifsAudioEnVigueur('2023-07-06')).toBeNull();
  });

  it('renvoie null sans base importée', async () => {
    expect(await tarifsAudioEnVigueur('2026-10-30')).toBeNull();
  });
});
