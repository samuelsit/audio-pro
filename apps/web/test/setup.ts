import { CHIFFREMENT_TEST, urlBaseJetable, urlsDesRoles } from './env';

// Les clients Prisma lisent leur URL au premier appel.
Object.assign(process.env, urlsDesRoles(urlBaseJetable('DATABASE_URL_TEST')));
Object.assign(process.env, CHIFFREMENT_TEST);
process.env.DOCUMENTS_STOCKAGE = 'memoire';
process.env.PDF_RENDU = 'simulation';
process.env.NOTIFIER = 'simulation';
process.env.BILLING_ENGINE = 'simulation';
process.env.PEC_GATEWAY = 'simulation';
process.env.E_SIGNATURE = 'simulation';
process.env.CAPTCHA = 'simulation';
process.env.LIEN_RDV_CLE = Buffer.alloc(32, 9).toString('base64');
