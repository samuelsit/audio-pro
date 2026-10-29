# Décisions d'architecture (ADR)

Format court : contexte, décision, conséquences. Une ADR acceptée ne se modifie pas : on en écrit une nouvelle qui la remplace.

---

## ADR-001 – Stack et architecture ports/adaptateurs

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

HA-Gestion est le logiciel de gestion interne d'un réseau d'une douzaine de centres d'audioprothèse, développé par une seule personne. Les règles réglementaires (LPP, 100 % Santé, devis normalisé) doivent être testables isolément. Les systèmes externes (lecteur Vitale, Cosium, puis AreaFSE) vont changer au fil du projet : simulation, puis export, puis intégration réelle.

### Décision

- **Monorepo pnpm, TypeScript strict** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), un seul lockfile.
  - `apps/web` : Next.js (App Router), Tailwind et shadcn/ui, interface en français. Les accès aux données passent uniquement par `apps/web/server`.
  - `packages/domain` : logique métier pure et ports (interfaces). Aucune dépendance runtime à part Zod.
  - `packages/adapters` : implémentations des ports, avec un adaptateur Fake par port pour le dev et les tests.
  - `packages/db` : Prisma et PostgreSQL 16, migrations versionnées.
- **Architecture hexagonale** : le domaine définit les ports (`Clock`, `VitaleReader`, `BillingEngine`, `LegacyExporter`, `DocumentStore`, `PdfRenderer`) et ne dépend de rien. L'application assemble domaine et adaptateurs dans ses services serveur. La facturation SESAM-Vitale sera branchée derrière `BillingEngine` (AreaFSE), sans jamais réimplémenter la norme.
- **Limites vérifiées par l'outillage** : ESLint interdit dans le domaine les imports de framework, de Prisma et de modules Node, ainsi que `new Date()` et `Date.now()`. Il interdit aussi `@ha/db` et `@prisma/*` dans l'application, sauf dans `server/`. La couverture du domaine est exigée à 100 % par `pnpm test`.
- **Packages internes consommés en source TS** (`exports` → `src/index.ts`), transpilés par Next (`transpilePackages`) et Vitest, donc sans étape de build.
- **Validation Zod** à chaque frontière. Montants en centimes entiers (type marqué `Centimes`).
- **Tests** : Vitest (unitaires et intégration), Playwright (E2E des parcours critiques, hors CI pour l'instant).
- **Local** : docker-compose avec PostgreSQL 16 (port hôte 5433) et un stockage S3 compatible MinIO.
- **CI** GitHub Actions : lint, vérification Prettier, typecheck, tests.

### Versions épinglées (octobre 2026)

| Outil                     | Version                            | Raison                                                                                                   |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Node                      | 24 LTS                             |                                                                                                          |
| pnpm                      | 11.5                               |                                                                                                          |
| TypeScript                | 6.0                                | typescript-eslint 8.72 ne supporte pas TS ≥ 6.1 (TS 7 publié)                                            |
| ESLint                    | 9.39                               | eslint-config-next 16 dépend de plugins (react, import, jsx-a11y) qui ne supportent pas encore ESLint 10 |
| Next.js / React           | 16.4 / 19.3                        |                                                                                                          |
| Tailwind / shadcn         | 4.3 / CLI 4.23 (style radix-nova)  |                                                                                                          |
| Prisma                    | 7.10 (stable)                      | la 8.0 n'est qu'en RC ; Prisma 7 impose `prisma.config.ts` et un driver adapter (`@prisma/adapter-pg`)   |
| Zod / Vitest / Playwright | 4.6 / 5.0 / 1.64                   |                                                                                                          |
| MinIO                     | `pgsty/minio` (fork communautaire) | l'image officielle `minio/minio` n'est plus distribuée                                                   |

### Conséquences

- Le domaine se teste sans base ni réseau. Chaque système externe peut être remplacé (Fake, puis réel) sans toucher aux règles.
- Un peu plus de code au départ (ports et Fakes), accepté pour la testabilité réglementaire.
- Montées de version à surveiller : TS 7 dès que typescript-eslint le supporte, ESLint 10 dès que eslint-config-next suit, Prisma 8 en version stable.
- Le stockage S3 local repose sur un fork communautaire de MinIO. Si ce fork n'est plus maintenu, on le remplace par un autre service compatible S3 (Garage, SeaweedFS) sans impact sur le code, qui passe par le port `DocumentStore`.
