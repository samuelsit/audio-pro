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

---

## ADR-002 – Authentification, rôles et cloisonnement par centre

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

L'étape 1 introduit les comptes (ADMIN, AUDIO, ASSISTANT), le rattachement aux centres et les praticiens. Il faut une connexion e-mail + mot de passe, des sessions révocables, une 2FA TOTP obligatoire pour l'ADMIN, et un cloisonnement strict : un utilisateur ne voit que les données de ses centres. Auth.js v5 impose des sessions JWT avec le provider Credentials (révocation difficile) et n'a pas de TOTP intégré ; son équipe de maintenance recommande Better Auth pour les nouveaux projets.

### Décision

- **Better Auth 1.7.14**, épinglé en version exacte, avec l'adaptateur Prisma et le plugin `twoFactor`. Télémétrie désactivée. Hachage des mots de passe : scrypt (défaut de Better Auth).
- **Pas de handler HTTP `/api/auth/*`** : Better Auth n'est appelé que depuis des server actions (`auth().api.*`, plugin `nextCookies`). Moins de surface exposée (pas de `update-user`, `sign-up`, etc.). Conséquence : le limiteur de débit de Better Auth, qui ne s'applique qu'à son handler, est remplacé par le nôtre (`server/auth/limitation.ts`, table `limitation_debit`) : 10 tentatives de connexion par e-mail et 30 par IP sur 15 min. Le verrouillage après échecs TOTP reste celui du plugin.
- **Instance paresseuse** (`auth()`), créée au premier appel : le build Next n'a besoin ni de base ni de secret.
- **Sessions en base** : 12 h, prolongées toutes les heures, sans cache en cookie, pour qu'une désactivation ou une révocation soit immédiate. Cookies préfixés `ha`, `HttpOnly`, `SameSite=Lax`, `Secure` en production. Un hook refuse toute création de session pour un compte désactivé.
- **Pas d'inscription publique** : l'ADMIN crée les comptes avec un mot de passe provisoire (≥ 12 caractères, règle interne), à changer à la première connexion (`doitChangerMotDePasse`). L'ADMIN peut réinitialiser un mot de passe, ce qui ferme les sessions de l'utilisateur.
- **2FA TOTP** : champ prévu pour tous (`twoFactorEnabled`), obligatoire pour l'ADMIN. `requireSession()` impose, dans l'ordre, le changement du mot de passe provisoire puis l'activation de la 2FA. Pas d'option « appareil de confiance ». 10 codes de secours.
- **Schéma** : les tables techniques de Better Auth gardent les noms de champs imposés (`name`, `emailVerified`, `userId`, etc.) mais sont renommées en français (`utilisateur`, `compte`, `deux_facteurs`…), avec des colonnes en snake_case. `Utilisateur` est la table « user » de Better Auth enrichie de nos champs (prénom, nom, rôle, organisation, actif).
- **Cloisonnement** :
  - Règles pures dans le domaine (`peutAccederAuCentre`, `resoudrePerimetre`) : un ADMIN accède à tous les centres de l'organisation sans rattachement, les autres seulement à leurs centres actifs.
  - Le « centre courant » est un cookie `ha_centre` (id ou `tous`), jamais cru sur parole : il est résolu à chaque requête contre les droits, et un choix interdit retombe sur un centre autorisé.
  - Les services reçoivent explicitement l'acteur et le périmètre, et revérifient les droits (`verifierRole`, `verifierPerimetre`) même quand la page l'a déjà fait.
  - Un accès refusé à une page donne une 404, pour ne pas révéler qu'une ressource existe.
- **Praticien** : fiche liée 1–1 à un utilisateur AUDIO ; ses centres d'exercice doivent faire partie de ses centres de rattachement (contrôle service). RPPS et ADELI uniques.

### Conséquences

- Le schéma suit les noms de champs de Better Auth : à chaque montée de version, comparer `@better-auth/core/dist/db/get-tables.mjs` et le schéma du plugin `twoFactor` avec `schema.prisma` (le CLI `@better-auth/cli` est resté en 1.4 et ne génère pas un schéma fiable pour la 1.7).
- Le secret TOTP est chiffré par Better Auth avec `BETTER_AUTH_SECRET`, sans passer par notre futur chiffrement applicatif (étape 2). Changer ce secret invalide toutes les 2FA.
- Pas encore de réinitialisation du mot de passe par e-mail (pas d'envoi d'e-mails) : l'ADMIN fixe un mot de passe provisoire.
- Les actions d'administration ne sont pas encore journalisées : le journal d'audit arrive à l'étape 2.

---

## ADR-003 – Tests d'intégration et E2E sur PostgreSQL réel

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

Le cloisonnement par centre et les contraintes d'unicité se jouent dans les requêtes SQL. Les simuler (Fake, base en mémoire) laisserait passer les erreurs qui comptent. Prisma 7, avec le driver adapter PostgreSQL, signale par exemple une violation d'unicité par le nom de l'index, pas par la liste des champs.

### Décision

- **Tests d'intégration des services** (Vitest, projet `web`, fichiers `*.int.test.ts`) sur une base `ha_gestion_test` (`DATABASE_URL_TEST`). Le `globalSetup` crée la base si besoin et applique les migrations versionnées. Les tables sont vidées avant chaque test et les fichiers s'exécutent en série.
- **E2E** (Playwright) sur une base `ha_gestion_e2e` (`DATABASE_URL_E2E`), vidée puis seedée à chaque exécution, avec un serveur Next dédié (jamais réutilisé).
- **Garde-fou** : l'outillage (`preparerBaseJetable`, `viderBaseJetable` dans `@ha/db`) refuse toute base dont le nom ne se termine pas par `_test` ou `_e2e`.
- **CI** : un service PostgreSQL 16 exécute les tests d'intégration dans `pnpm test`. L'E2E reste hors CI pour l'instant.

### Conséquences

- `pnpm test` exige PostgreSQL : `docker compose up -d postgres` en local.
- La couverture à 100 % reste exigée sur le domaine seulement. Les services sont couverts par l'intégration, sans seuil.

---

## ADR-004 – Journal d'audit

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

Toute lecture ou modification d'un dossier patient doit être tracée (CLAUDE.md), ainsi que les actions d'administration et les connexions reportées de l'étape 1. Le journal ne doit contenir ni NIR ni donnée de santé en clair, et ne doit pas pouvoir être retouché après coup.

### Décision

- **Table `journal_audit`** : qui (identifiant + instantané « Prénom Nom <e-mail> » et rôle), quand (`horodatage`, heure de début de la transaction), organisation, centre, action, type et identifiant de l'entité, patient concerné, champs modifiés, détails. Pas de clé étrangère : une ligne survit à l'entité ou au compte qu'elle décrit.
- **Actions** : READ, CREATE, UPDATE, DELETE, EXPORT, PRINT, plus CONNEXION, ECHEC_CONNEXION et DECONNEXION. Les types d'entité sont une colonne texte validée par le domaine (`TYPES_ENTITE`) pour ne pas migrer à chaque nouveau type.
- **Ajout seul** : un trigger PostgreSQL refuse tout UPDATE et DELETE. `TRUNCATE` reste possible pour les bases jetables de test ; une purge liée à la durée de conservation passera par une migration dédiée.
- **Masquage** : liste blanche par type d'entité dans le domaine (`CHAMPS_VISIBLES_AUDIT`) ; un champ hors liste est journalisé « modifié » sans valeur (mot de passe, toute donnée patient). Filet de sécurité supplémentaire : toute chaîne qui ressemble à un NIR est remplacée par « [masqué] », dans les champs, les détails et le libellé de l'auteur.
- **`withAudit(acteur, operation, evenement)`** (apps/web/server/audit) : l'opération et la ligne d'audit s'exécutent dans la même transaction. Si l'écriture du journal échoue, l'opération est annulée ; une opération en échec ne laisse aucune ligne. Tout service qui lit ou modifie un dossier patient passe par là ; ouvrir un dossier écrit une ligne READ.
- **Connexions** : succès journalisé après le second facteur s'il est exigé ; échec par identifiants avec le compte retrouvé par e-mail (ou l'adresse tentée si le compte n'existe pas) ; échec au second facteur sans identité (l'adresse n'est pas connue à cette étape). Les tentatives refusées par la limitation de débit ne sont pas journalisées, pour qu'une attaque ne remplisse pas le journal.
- **Consultation** : écran ADMIN filtrable (utilisateur, patient, période en jours Europe/Paris) et export CSV (`;`, BOM UTF-8, protection contre l'injection de formules), lui-même journalisé (EXPORT, filtres en détail). Les échecs de connexion sur un compte inconnu (sans organisation) sont visibles par l'ADMIN.

### Conséquences

- Les services existants (centres, utilisateurs, praticiens, compte) passent par `withAudit` ; les nouveaux services patients devront le faire aussi (vérifié en revue et par les tests d'intégration).
- Les lignes d'une même transaction partagent le même horodatage.
- Pas d'adresse IP ni d'agent utilisateur pour l'instant (étape 15). Durée de conservation non définie (À VÉRIFIER, aucune source dans docs/ref).

---

## ADR-005 – Chiffrement applicatif des champs sensibles

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

Le NIR et les données de santé doivent être chiffrés au repos par l'application (CLAUDE.md), avec une rotation de clés possible. Le domaine reste pur et n'a pas besoin de chiffrer.

### Décision

- **AES-256-GCM** (`node:crypto`), IV aléatoire de 96 bits, tag de 128 bits. Valeur stockée en texte : `v1.<idCle>.<iv>.<chiffré + tag>` (base64url). Données authentifiées : version, identifiant de clé et **contexte** (ex. `patient.nir`) : une valeur copiée dans une autre colonne ne se déchiffre pas.
- **Trousseau en variables d'environnement** : `CHIFFREMENT_CLES` (liste `id:clé base64 de 32 octets`) et `CHIFFREMENT_CLE_ACTIVE`. Rotation : on ajoute une clé et on la rend active ; les anciennes valeurs restent lisibles grâce à l'identifiant stocké dans l'enveloppe, `rechiffrer()` les passe sur la clé active, puis l'ancienne clé peut être retirée.
- **Extension Prisma** `extensionChampsChiffres` (packages/adapters/src/crypto), branchée dans `apps/web/server/chiffrement.ts` (`base()`) avec la configuration `CHAMPS_CHIFFRES` : chiffrement à l'écriture (create, update, upsert, createMany…), déchiffrement à la lecture, refus de tout filtre, tri ou regroupement sur un champ chiffré. Les écritures et lectures imbriquées via une relation ne sont pas traitées : on accède au modèle chiffré directement. Défense en profondeur : chaque colonne chiffrée reçoit une contrainte `CHECK (colonne LIKE 'v1.%')` dans sa migration.
- **Pas de port dans le domaine ni d'adaptateur Fake** : le domaine ne chiffre jamais, et un Fake risquerait d'écrire des valeurs en clair en développement. Les tests utilisent le vrai chiffrement avec une clé de test fixe. Cela lève le « À VÉRIFIER » sur le port `Cipher`.
- Les messages d'erreur ne contiennent jamais la valeur ni la clé.

### Conséquences

- Un champ chiffré n'est ni cherchable ni unique en base : pour retrouver ou dédoublonner un patient par NIR, il faudra une empreinte (HMAC avec une clé distincte), à concevoir à l'étape 3.
- La configuration est vide tant qu'aucun modèle n'a de champ chiffré ; le test d'intégration de l'extension sur un vrai modèle arrive avec les patients (étape 3).
- Stockage des clés en production (hébergeur HDS, KMS) et script de rechiffrement en masse : étapes 15 et 16.
