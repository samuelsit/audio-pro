import path from 'node:path';

import { config } from 'dotenv';

import { configurerRoles } from '../src/outils';

// Autorise la connexion des rôles créés par les migrations, avec les mots de passe de leurs URL.
config({ path: path.join(import.meta.dirname, '../../../.env'), quiet: true });

function motDePasse(variable: string): string {
  const url = process.env[variable];
  if (!url) {
    throw new Error(`${variable} n’est pas défini (voir .env.example).`);
  }
  return decodeURIComponent(new URL(url).password);
}

await configurerRoles(process.env.DATABASE_URL_ADMIN ?? '', {
  ha_app: motDePasse('DATABASE_URL'),
  ha_plateforme: motDePasse('DATABASE_URL_PLATEFORME'),
  ha_jobs: motDePasse('DATABASE_URL_JOBS'),
});
