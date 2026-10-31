import { CHIFFREMENT_TEST, urlBaseJetable, urlsDesRoles } from './env';

// Les clients Prisma lisent leur URL au premier appel.
Object.assign(process.env, urlsDesRoles(urlBaseJetable('DATABASE_URL_TEST')));
Object.assign(process.env, CHIFFREMENT_TEST);
process.env.DOCUMENTS_STOCKAGE = 'memoire';
process.env.PDF_RENDU = 'simulation';
