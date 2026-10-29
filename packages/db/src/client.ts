import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export function creerPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalPourPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Client partagé côté serveur (réutilisé entre les rechargements à chaud de Next en dev). */
export function prisma(): PrismaClient {
  if (!globalPourPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL n’est pas défini (voir .env.example).');
    }
    globalPourPrisma.prisma = creerPrismaClient(url);
  }
  return globalPourPrisma.prisma;
}
