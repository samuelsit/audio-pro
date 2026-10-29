import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { creerPrismaClient } from '@ha/db';

import { urlBaseDeTest } from './env';

/** Crée la base de test si besoin puis applique les migrations versionnées. */
export default async function setup(): Promise<void> {
  const url = urlBaseDeTest();
  const nomBase = new URL(url).pathname.slice(1);
  const urlMaintenance = new URL(url);
  urlMaintenance.pathname = '/postgres';

  const admin = creerPrismaClient(urlMaintenance.toString());
  try {
    const existe = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${nomBase}`;
    if (existe.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${nomBase}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.join(import.meta.dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
