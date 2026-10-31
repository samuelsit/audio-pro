import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export function creerPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

type Variable = 'DATABASE_URL' | 'DATABASE_URL_PLATEFORME' | 'DATABASE_URL_ADMIN';

const globalPourPrisma = globalThis as unknown as { prismaClients?: Map<Variable, PrismaClient> };

/** Un client par rôle PostgreSQL (réutilisé entre les rechargements à chaud de Next en dev). */
export function clientPartage(variable: Variable): PrismaClient {
  globalPourPrisma.prismaClients ??= new Map();
  let client = globalPourPrisma.prismaClients.get(variable);
  if (!client) {
    const url = process.env[variable];
    if (!url) {
      throw new Error(`${variable} n’est pas défini (voir .env.example).`);
    }
    client = creerPrismaClient(url);
    globalPourPrisma.prismaClients.set(variable, client);
  }
  return client;
}
