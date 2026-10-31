import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { preparerBaseJetable, viderBaseJetable } from '@ha/db/admin';

import { CHIFFREMENT_TEST, urlBaseJetable, urlsDesRoles } from '../test/env';

/** Base E2E repartie de zéro : migrations, tables vidées, seed de démonstration, extrait de la LPP. */
export default async function globalSetup(): Promise<void> {
  const url = urlBaseJetable('DATABASE_URL_E2E');
  await preparerBaseJetable(url);
  await viderBaseJetable(url);
  execFileSync('pnpm', ['run', 'seed'], {
    cwd: path.join(import.meta.dirname, '../../../packages/db'),
    env: { ...process.env, ...urlsDesRoles(url), ...CHIFFREMENT_TEST },
    stdio: 'pipe',
  });
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/import-lpp.ts', 'fixtures/lpp/908'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: {
      ...process.env,
      ...urlsDesRoles(url),
      INIT_CWD: path.join(import.meta.dirname, '../../..'),
      ...CHIFFREMENT_TEST,
    },
    stdio: 'pipe',
  });
}
