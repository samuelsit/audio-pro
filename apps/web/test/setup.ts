import { urlBaseDeTest } from './env';

// Le client Prisma partagé (`prisma()` de @ha/db) lit DATABASE_URL au premier appel.
process.env.DATABASE_URL = urlBaseDeTest();
