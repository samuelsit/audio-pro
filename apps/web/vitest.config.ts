import { defineProject } from 'vitest/config';

// Tests d'intégration des services serveur, sur la base PostgreSQL de test (DATABASE_URL_TEST).
export default defineProject({
  resolve: { alias: { '@': import.meta.dirname } },
  test: {
    name: 'web',
    include: ['server/**/*.int.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Une seule base partagée : les fichiers s'exécutent l'un après l'autre.
    fileParallelism: false,
  },
});
