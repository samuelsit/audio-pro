import { existsSync } from 'node:fs';
import path from 'node:path';

import type { NextConfig } from 'next';

// Un seul fichier .env, à la racine du monorepo (développement). En production, variables d'environnement.
const envRacine = path.join(import.meta.dirname, '../../.env');
if (existsSync(envRacine)) {
  process.loadEnvFile(envRacine);
}

const nextConfig: NextConfig = {
  // Les règles pour les agents sont dans CLAUDE.md à la racine.
  agentRules: false,
  transpilePackages: ['@ha/domain', '@ha/adapters', '@ha/db'],
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
};

export default nextConfig;
