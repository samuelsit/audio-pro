import { urlDuRole } from '@ha/db/admin';

import { urlBaseJobs } from './env';

const url = urlBaseJobs();
process.env.DATABASE_URL_ADMIN = url;
process.env.DATABASE_URL = urlDuRole(url, 'ha_app');
process.env.DATABASE_URL_JOBS = urlDuRole(url, 'ha_jobs');
