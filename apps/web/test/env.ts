import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { urlDuRole, verifierBaseJetable } from '@ha/db/admin';

/** Messages du FakeNotifier pendant les E2E : le serveur et Playwright sont deux processus. */
export const FICHIER_NOTIFICATIONS_E2E = path.join(tmpdir(), 'ha-notifications-e2e.jsonl');

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

/** Variables de connexion de l'application sur une base jetable : un rôle par usage (ADR-016). */
export function urlsDesRoles(urlAdmin: string) {
  return {
    DATABASE_URL_ADMIN: urlAdmin,
    DATABASE_URL: urlDuRole(urlAdmin, 'ha_app'),
    DATABASE_URL_PLATEFORME: urlDuRole(urlAdmin, 'ha_plateforme'),
    DATABASE_URL_JOBS: urlDuRole(urlAdmin, 'ha_jobs'),
  };
}

/**
 * Clés de chiffrement et d'empreinte des tests (intégration et E2E) : fixes, sans valeur réelle à protéger.
 * Toujours celle-ci, quel que soit le .env, pour que les bases jetables restent lisibles d'une exécution à l'autre.
 */
export const CHIFFREMENT_TEST = {
  CHIFFREMENT_CLES: 'test:5eem5m5OZFBp6LOQOItOGaf7gSGaHT+HmpXzSV1M4vA=',
  CHIFFREMENT_CLE_ACTIVE: 'test',
  EMPREINTE_CLE: '9PNvMc87U/83yMpLXmb6C5zDU0FrYrYAb4hLm6QDRNc=',
} as const;
