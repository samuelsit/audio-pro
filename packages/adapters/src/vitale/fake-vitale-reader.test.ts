import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ErreurLectureVitale, type CodeErreurVitale } from '@ha/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeClock } from '../clock/fake-clock';
import {
  cartesSimulees,
  decoderSimulation,
  encoderSimulation,
  FakeVitaleReader,
  INCIDENTS_SIMULES,
  LecteurVitaleAbsent,
  type SimulationVitale,
} from './fake-vitale-reader';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures/vitale');
const INSTANT = '2026-10-29T10:00:00.000+01:00';

function lecteur(simulation: SimulationVitale, dossier = FIXTURES): FakeVitaleReader {
  return new FakeVitaleReader({ dossier, simulation, clock: new FakeClock(INSTANT) });
}

async function codeErreur(lecture: Promise<unknown>): Promise<CodeErreurVitale> {
  const erreur: unknown = await lecture.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(ErreurLectureVitale);
  return (erreur as ErreurLectureVitale).code;
}

describe('FakeVitaleReader : cartes de fixtures/vitale', () => {
  it.each([
    { fichier: 'assure-seul.json', beneficiaires: 1, source: 'CARTE' },
    { fichier: 'famille.json', beneficiaires: 3, source: 'CARTE' },
    { fichier: 'beneficiaire-c2s.json', beneficiaires: 1, source: 'APCV' },
    { fichier: 'droits-expires.json', beneficiaires: 1, source: 'CARTE' },
  ])('$fichier se lit', async ({ fichier, beneficiaires, source }) => {
    const resultat = await lecteur({ type: 'carte', fichier }).readCard();
    expect(resultat.beneficiaires).toHaveLength(beneficiaires);
    expect(resultat.source).toBe(source);
    expect(resultat.dateLecture).toBe(INSTANT);
  });

  it('la famille porte un assuré et deux ayants droit de même NIR', async () => {
    const { beneficiaires } = await lecteur({ type: 'carte', fichier: 'famille.json' }).readCard();
    expect(beneficiaires.map((b) => b.qualite)).toEqual(['ASSURE', 'AYANT_DROIT', 'AYANT_DROIT']);
    expect(new Set(beneficiaires.map((b) => b.nir)).size).toBe(1);
  });

  it('le bénéficiaire C2S et les droits expirés', async () => {
    const c2s = await lecteur({ type: 'carte', fichier: 'beneficiaire-c2s.json' }).readCard();
    expect(c2s.beneficiaires[0]?.c2s).toBe(true);
    const expires = await lecteur({ type: 'carte', fichier: 'droits-expires.json' }).readCard();
    expect(expires.beneficiaires[0]?.droitsAmo.fin).toBe('2025-12-31');
  });

  it('la carte bloquée échoue', async () => {
    expect(
      await codeErreur(lecteur({ type: 'carte', fichier: 'carte-bloquee.json' }).readCard()),
    ).toBe('CARTE_BLOQUEE');
  });
});

describe('FakeVitaleReader : erreurs', () => {
  let dossier: string;

  beforeAll(async () => {
    dossier = await mkdtemp(join(tmpdir(), 'ha-vitale-'));
    await writeFile(join(dossier, 'json-casse.json'), '{ pas du json');
    await writeFile(
      join(dossier, 'nir-faux.json'),
      JSON.stringify({
        libelle: 'NIR faux',
        etat: 'VALIDE',
        source: 'CARTE',
        beneficiaires: [{ nir: '1' }],
      }),
    );
    await writeFile(join(dossier, 'sans-libelle.json'), '{}');
  });

  afterAll(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  it.each<{ simulation: SimulationVitale; code: CodeErreurVitale }>([
    { simulation: { type: 'aucun-lecteur' }, code: 'AUCUN_LECTEUR' },
    { simulation: { type: 'lecteur-vide' }, code: 'CARTE_ABSENTE' },
    { simulation: { type: 'illisible' }, code: 'CARTE_INVALIDE' },
    { simulation: { type: 'panne' }, code: 'ERREUR_TECHNIQUE' },
    { simulation: { type: 'carte', fichier: 'inexistante.json' }, code: 'ERREUR_TECHNIQUE' },
    { simulation: { type: 'carte', fichier: '../../etc/passwd' }, code: 'CARTE_ABSENTE' },
  ])('$simulation.type ($simulation.fichier) → $code', async ({ simulation, code }) => {
    expect(await codeErreur(lecteur(simulation).readCard())).toBe(code);
  });

  it.each(['json-casse.json', 'nir-faux.json'])('%s → CARTE_INVALIDE', async (fichier) => {
    expect(await codeErreur(lecteur({ type: 'carte', fichier }, dossier).readCard())).toBe(
      'CARTE_INVALIDE',
    );
  });

  it('cartesSimulees : libellé, ou nom du fichier s’il est illisible', async () => {
    expect(await cartesSimulees(dossier)).toEqual([
      { fichier: 'json-casse.json', libelle: 'json-casse.json' },
      { fichier: 'nir-faux.json', libelle: 'NIR faux' },
      { fichier: 'sans-libelle.json', libelle: 'sans-libelle.json' },
    ]);
    expect(await cartesSimulees(join(dossier, 'absent'))).toEqual([]);
  });
});

describe('cartesSimulees sur fixtures/vitale', () => {
  it('liste les 5 cartes fictives', async () => {
    expect((await cartesSimulees(FIXTURES)).map((c) => c.fichier)).toEqual([
      'assure-seul.json',
      'beneficiaire-c2s.json',
      'carte-bloquee.json',
      'droits-expires.json',
      'famille.json',
    ]);
  });
});

describe('encoderSimulation / decoderSimulation', () => {
  it.each<SimulationVitale>([
    { type: 'carte', fichier: 'famille.json' },
    ...INCIDENTS_SIMULES.map(({ type }) => ({ type })),
  ])('aller-retour : %o', (simulation) => {
    expect(decoderSimulation(encoderSimulation(simulation))).toEqual(simulation);
  });

  it.each([undefined, '', 'inconnu', 'carte:../secret.json', 'carte:'])(
    '%s → lecteur sans carte',
    (valeur) => {
      expect(decoderSimulation(valeur)).toEqual({ type: 'lecteur-vide' });
    },
  );
});

describe('LecteurVitaleAbsent', () => {
  it('échoue toujours avec AUCUN_LECTEUR', async () => {
    expect(await codeErreur(new LecteurVitaleAbsent().readCard())).toBe('AUCUN_LECTEUR');
  });
});
