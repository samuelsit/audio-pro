import { urlDuRole } from '@ha/db/admin';

import { urlBaseJobs } from './env';

const url = urlBaseJobs();
process.env.DATABASE_URL_ADMIN = url;
process.env.DATABASE_URL = urlDuRole(url, 'ha_app');
process.env.DATABASE_URL_JOBS = urlDuRole(url, 'ha_jobs');
process.env.DATABASE_URL_PLATEFORME = urlDuRole(url, 'ha_plateforme');
process.env.CHIFFREMENT_CLES = 'test:5eem5m5OZFBp6LOQOItOGaf7gSGaHT+HmpXzSV1M4vA=';
process.env.CHIFFREMENT_CLE_ACTIVE = 'test';
