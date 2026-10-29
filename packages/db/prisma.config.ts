import path from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Un seul fichier .env, à la racine du monorepo.
config({ path: path.join(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Vide en CI : `prisma generate` n'a pas besoin de connexion.
    url: process.env.DATABASE_URL ?? '',
  },
});
