# Services serveur

Seul point d'accès à `@ha/db` et aux adaptateurs depuis l'application : les composants n'appellent jamais Prisma directement (voir CLAUDE.md).

- `auth/` : Better Auth (`auth()`), chargement du profil et contrôles d'accès (`acces.ts`), gardes Next (`gardes.ts` : `requireSession`, `requireRole`, `requireCentreAccess`, `perimetreCourant`), limitation de débit.
- `services/` : une fonction par cas d'usage. Chaque fonction reçoit l'acteur (et le périmètre pour les listes), revérifie les droits, valide sa saisie avec Zod et lève `ErreurSaisie` ou `AccesRefuseError`.
- Tests d'intégration : `*.int.test.ts`, sur la base `DATABASE_URL_TEST` (voir ADR-003).
- `audit/journal.ts` : journal d'audit (ADR-004). `withAudit(acteur, operation, evenement)` exécute l'opération et écrit la ligne dans la même transaction (si le journal échoue, l'opération est annulée). **Tout service qui lit ou modifie un dossier patient passe par `withAudit`** : ouvrir un dossier = une ligne `READ`, avec `patientId` renseigné. Les champs modifiés viennent de `differencesAuditees` (liste blanche du domaine) ; le NIR n'est jamais écrit en clair.
- `chiffrement.ts` : `base()`, client Prisma qui chiffre les champs de `CHAMPS_CHIFFRES` (ADR-005). Les services qui touchent un champ chiffré l'utilisent (`withAudit` aussi).
