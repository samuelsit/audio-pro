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
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@aws-sdk/client-s3'],
  // Un scan d'ordonnance va jusqu'à 10 Mo (TAILLE_MAX_DOCUMENT_OCTETS), le reste du formulaire en plus.
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
    proxyClientMaxBodySize: '12mb',
  },
};

export default nextConfig;
