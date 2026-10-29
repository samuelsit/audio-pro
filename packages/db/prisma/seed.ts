import { creerPrismaClient } from '../src/client';

// Seed idempotent. Aucune donnée patient, même fictive, à l'étape 0.
const SCHEMA_VERSION = '0';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL n’est pas défini (voir .env.example).');
  }
  const db = creerPrismaClient(url);
  try {
    const seededAt = new Date().toISOString();
    for (const [key, value] of [
      ['schema_version', SCHEMA_VERSION],
      ['seeded_at', seededAt],
    ] as const) {
      await db.appMeta.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    console.log(`Seed terminé (schema_version=${SCHEMA_VERSION}).`);
  } finally {
    await db.$disconnect();
  }
}

await main();
