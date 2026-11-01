import { existsSync } from 'node:fs';
import path from 'node:path';

import type { NextConfig } from 'next';

// Un seul fichier .env, à la racine du monorepo (développement). En production, variables d'environnement.
const envRacine = path.join(import.meta.dirname, '../../.env');
if (existsSync(envRacine)) {
  process.loadEnvFile(envRacine);
}

const INTERDIT_EN_CADRE = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  // Les règles pour les agents sont dans CLAUDE.md à la racine.
  agentRules: false,
  // Seul le parcours public s'intègre à un site tiers ; le logiciel et le lien du patient, jamais (ADR-021).
  async headers() {
    return [
      { source: '/((?!rdv/).*)', headers: INTERDIT_EN_CADRE },
      {
        source: '/rdv/:client/:centre',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
      {
        source: '/document/:jeton*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/rdv/lien/:jeton',
        headers: [
          ...INTERDIT_EN_CADRE,
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  transpilePackages: ['@ha/domain', '@ha/adapters', '@ha/db'],
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    '@aws-sdk/client-s3',
    'playwright-core',
  ],
  // Un scan d'ordonnance va jusqu'à 10 Mo (TAILLE_MAX_DOCUMENT_OCTETS), le reste du formulaire en plus.
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
    proxyClientMaxBodySize: '12mb',
  },
};

export default nextConfig;
