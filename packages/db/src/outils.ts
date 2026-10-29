import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { creerPrismaClient } from './client';

// Outillage des bases de test (intégration, E2E). Jamais utilisé par l'application.

/** Refuse toute base dont le nom ne se termine pas par `_test` ou `_e2e` (elles sont vidées). */
export function verifierBaseJetable(url: string): void {
  if (!/\/[\w-]+_(test|e2e)(\?|$)/.test(url)) {
    throw new Error(
      `Base refusée : son nom doit se terminer par « _test » ou « _e2e » (${new URL(url).pathname}).`,
    );
  }
}

/** Crée la base si besoin, puis applique les migrations versionnées. */
export async function preparerBaseJetable(url: string): Promise<void> {
  verifierBaseJetable(url);
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
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

/** Vide toutes les tables métier et d'authentification. */
export async function viderBaseJetable(url: string): Promise<void> {
  verifierBaseJetable(url);
  const db = creerPrismaClient(url);
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'app_meta')`;
    if (tables.length > 0) {
      await db.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}
