import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { preparerBaseJetable, viderBaseJetable } from '@ha/db';

import { CHIFFREMENT_TEST, urlBaseJetable } from '../test/env';

/** Base E2E repartie de zéro : migrations, tables vidées, seed de démonstration. */
export default async function globalSetup(): Promise<void> {
  const url = urlBaseJetable('DATABASE_URL_E2E');
  await preparerBaseJetable(url);
  await viderBaseJetable(url);
  execFileSync('pnpm', ['run', 'seed'], {
    cwd: path.join(import.meta.dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url, ...CHIFFREMENT_TEST },
    stdio: 'pipe',
  });
}
