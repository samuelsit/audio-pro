import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/domain', 'packages/adapters', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test-support.ts', '**/index.ts', '**/ports/**'],
      thresholds: { 100: true },
    },
  },
});
