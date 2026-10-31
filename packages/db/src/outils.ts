import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { creerPrismaClient } from './client';

// Outillage des rôles de connexion et des bases de test. Jamais utilisé par l'application.

/** Rôles de connexion créés par la migration `roles_connexion` (ADR-016). */
export const ROLES_CONNEXION = ['ha_app', 'ha_plateforme', 'ha_jobs'] as const;
export type RoleConnexion = (typeof ROLES_CONNEXION)[number];

/** URL d'un rôle sur la même base : en dev et en test, son mot de passe est son nom. */
export function urlDuRole(urlAdmin: string, role: RoleConnexion): string {
  const url = new URL(urlAdmin);
  url.username = role;
  url.password = role;
  return url.toString();
}

/** Rôles encore sans droit de connexion : ceux qu'une base de test doit initialiser. */
async function rolesSansConnexion(urlAdmin: string): Promise<RoleConnexion[]> {
  const admin = creerPrismaClient(urlAdmin);
  try {
    const roles = await admin.$queryRaw<{ rolname: RoleConnexion }[]>`
      SELECT rolname FROM pg_roles WHERE rolname = ANY(${[...ROLES_CONNEXION]}) AND NOT rolcanlogin`;
    return roles.map((r) => r.rolname);
  } finally {
    await admin.$disconnect();
  }
}

/** Autorise la connexion des rôles, avec le mot de passe de chacun. Rejouable. */
export async function configurerRoles(
  urlAdmin: string,
  motsDePasse: Readonly<Partial<Record<RoleConnexion, string>>>,
): Promise<void> {
  const admin = creerPrismaClient(urlAdmin);
  try {
    for (const [role, motDePasse] of Object.entries(motsDePasse)) {
      const [requete] = await admin.$queryRaw<{ sql: string }[]>`
        SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', ${role}::text, ${motDePasse}::text) AS sql`;
      await admin.$executeRawUnsafe(requete?.sql ?? '');
    }
  } finally {
    await admin.$disconnect();
  }
}

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
    env: { ...process.env, DATABASE_URL_ADMIN: url },
    stdio: 'pipe',
  });
  // Les rôles valent pour tout le cluster : on ne touche jamais à des mots de passe déjà posés.
  const aInitialiser = await rolesSansConnexion(url);
  await configurerRoles(url, Object.fromEntries(aInitialiser.map((role) => [role, role])));
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
