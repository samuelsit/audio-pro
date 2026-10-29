import { existsSync } from 'node:fs';
import path from 'node:path';

/** Charge le .env racine (s'il existe) et renvoie l'URL de la base de test, après garde-fou. */
export function urlBaseDeTest(): string {
  const fichier = path.join(import.meta.dirname, '../../../.env');
  if (existsSync(fichier)) {
    process.loadEnvFile(fichier);
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST n’est pas défini (voir .env.example).');
  }
  // Les tests vident les tables : on refuse toute base dont le nom ne finit pas par « _test ».
  if (!/\/[\w-]+_test(\?|$)/.test(url)) {
    throw new Error(
      'DATABASE_URL_TEST doit désigner une base dont le nom se termine par « _test ».',
    );
  }
  return url;
}
