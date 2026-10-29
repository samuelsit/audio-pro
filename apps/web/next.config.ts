import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Les règles pour les agents sont dans CLAUDE.md à la racine.
  agentRules: false,
  transpilePackages: ['@ha/domain', '@ha/adapters', '@ha/db'],
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
};

export default nextConfig;
