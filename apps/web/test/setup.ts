import { CHIFFREMENT_TEST, urlBaseJetable } from './env';

// Le client Prisma partagé (`prisma()` de @ha/db) lit DATABASE_URL au premier appel.
process.env.DATABASE_URL = urlBaseJetable('DATABASE_URL_TEST');
Object.assign(process.env, CHIFFREMENT_TEST);
process.env.DOCUMENTS_STOCKAGE = 'memoire';
process.env.PDF_RENDU = 'simulation';
