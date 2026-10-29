import { existsSync } from 'node:fs';
import path from 'node:path';

import { verifierBaseJetable } from '@ha/db';

/** Charge le .env racine s'il existe (absent en CI, où les variables sont fournies). */
export function chargerEnvRacine(): void {
  const fichier = path.join(import.meta.dirname, '../../../.env');
  if (existsSync(fichier)) {
    process.loadEnvFile(fichier);
  }
}

/** URL d'une base jetable lue dans `variable`, après garde-fou sur son nom. */
export function urlBaseJetable(variable: 'DATABASE_URL_TEST' | 'DATABASE_URL_E2E'): string {
  chargerEnvRacine();
  const url = process.env[variable];
  if (!url) {
    throw new Error(`${variable} n’est pas défini (voir .env.example).`);
  }
  verifierBaseJetable(url);
  return url;
}
