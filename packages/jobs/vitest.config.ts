import { defineProject } from 'vitest/config';

// Base dédiée : les projets s'exécutent en parallèle et apps/web vide la sienne entre les tests.
export default defineProject({
  test: {
    name: 'jobs',
    include: ['src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Fichiers d'intégration sur une base partagée, vidée à leur démarrage.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
