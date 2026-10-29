# Services serveur

Seul point d'accès à `@ha/db` et aux adaptateurs depuis l'application : les composants n'appellent jamais Prisma directement (voir CLAUDE.md).

- `auth/` : Better Auth (`auth()`), chargement du profil et contrôles d'accès (`acces.ts`), gardes Next (`gardes.ts` : `requireSession`, `requireRole`, `requireCentreAccess`, `perimetreCourant`), limitation de débit.
- `services/` : une fonction par cas d'usage. Chaque fonction reçoit l'acteur (et le périmètre pour les listes), revérifie les droits, valide sa saisie avec Zod et lève `ErreurSaisie` ou `AccesRefuseError`.
- Tests d'intégration : `*.int.test.ts`, sur la base `DATABASE_URL_TEST` (voir ADR-003).
