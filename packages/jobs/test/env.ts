import { existsSync } from 'node:fs';
import path from 'node:path';

/** Base propre aux travaux, à côté de DATABASE_URL_TEST. */
export function urlBaseJobs(): string {
  const fichier = path.join(import.meta.dirname, '../../../.env');
  if (existsSync(fichier)) {
    process.loadEnvFile(fichier);
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST n’est pas défini (voir .env.example).');
  }
  const jobs = new URL(url);
  jobs.pathname = '/ha_gestion_jobs_test';
  return jobs.toString();
}
