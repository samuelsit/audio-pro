import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

// Chaque requête hors transaction ouvre sa propre transaction (voir contexte.ts) : sous charge, elle doit
// attendre une connexion plutôt qu'échouer (ADR-019).
const ATTENTE_CONNEXION_MS = 10_000;
const DUREE_TRANSACTION_MS = 15_000;

export function creerPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    transactionOptions: { maxWait: ATTENTE_CONNEXION_MS, timeout: DUREE_TRANSACTION_MS },
  });
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
