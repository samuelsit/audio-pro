import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapters',
    include: ['src/**/*.test.ts'],
    // Lancer Chromium et résoudre une preuve de travail dépassent 5 s quand toute la suite tourne.
    testTimeout: 30_000,
  },
});
