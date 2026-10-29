import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const webFiles = ['apps/web/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
      'packages/db/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Application web : règles Next.js.
  ...[...nextCoreWebVitals, ...nextTypescript].map((config) => ({ ...config, files: webFiles })),
  {
    files: webFiles,
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      // Les composants passent par apps/web/server, jamais directement par Prisma.
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@ha/db', message: 'Passer par un service de apps/web/server.' }],
          patterns: [
            { group: ['@prisma/*'], message: 'Passer par un service de apps/web/server.' },
          ],
        },
      ],
    },
  },
  {
    // Services serveur et outillage des tests (intégration, E2E).
    files: [
      'apps/web/server/**/*.ts',
      'apps/web/test/**/*.ts',
      'apps/web/e2e/**/*.ts',
      'apps/web/playwright.config.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Domaine pur : aucun I/O, aucun framework, pas d'accès direct à l'horloge.
  {
    files: ['packages/domain/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['next', 'react', 'react-dom', '@ha/db', '@ha/adapters'].map((name) => ({
            name,
            message: 'packages/domain doit rester pur (voir CLAUDE.md).',
          })),
          patterns: [
            {
              group: ['next/*', '@prisma/*', 'node:*', 'fs', 'path', 'http', 'https', 'net', 'os'],
              message: 'packages/domain doit rester pur (voir CLAUDE.md).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Utiliser le port Clock, jamais new Date() dans le domaine.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Utiliser le port Clock, jamais Date.now() dans le domaine.',
        },
      ],
      'no-restricted-globals': ['error', 'process', 'fetch', 'console'],
    },
  },

  prettier,
);
