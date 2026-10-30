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

---

## ADR-006 – Patients : empreinte du NIR, recherche, doublons et fusion

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

L'étape 3 introduit la fiche patient et ses couvertures AMO et AMC : le premier modèle qui contient des données de santé. Le NIR est chiffré (ADR-005), donc ni cherchable ni unique en base. Il faut pourtant une recherche par NIR exact et une détection de doublons. Le réseau compte plusieurs centres cloisonnés, et un même patient peut avoir été créé dans deux centres.

### Décision

- **Champs chiffrés** : `couverture_amo.nir` (NIR complet, clé comprise), `couverture_amo.ald` (indicateur ALD, donnée de santé, stocké en texte `OUI`/`NON` car l'extension ne chiffre que du texte) et `patient.notes` (texte libre qui peut contenir des données de santé). Chaque colonne porte une contrainte `CHECK (… LIKE 'v1.%')`. Les noms, la date de naissance et les coordonnées restent en clair pour la recherche.
- **Empreinte HMAC-SHA256** du NIR sans la clé (13 caractères normalisés), avec la clé `EMPREINTE_CLE`, **distincte** des clés AES, et le contexte `couverture_amo.nir`. Elle permet la recherche exacte et la détection des doublons. L'index n'est pas unique, car des ayants droit portent le NIR de l'assuré ouvrant droit. Rotation de la clé : recalcul de toutes les empreintes depuis les NIR déchiffrés (script prévu à l'étape 15).
- **Recherche** :
  - nom (de naissance ou d'usage), prénom, date de naissance : sur des colonnes normalisées (sans accents, majuscules, ponctuation retirée) calculées par le domaine (`normaliserPourRecherche`) ;
  - NIR exact : le NIR ne figure **jamais dans une URL** (historique du navigateur, journaux du serveur). Le formulaire est en POST. Il redirige vers la fiche s'il n'y a qu'un résultat, sinon vers la liste filtrée par l'empreinte.
  - Une liste n'ouvre aucune fiche : pas de ligne READ. Ouvrir une fiche écrit une ligne READ (`withAudit`).
- **Doublons** (`motifsDoublon`, domaine) :
  - même nom (de naissance ou d'usage, croisés) et même date de naissance ;
  - ou même NIR pour le même bénéficiaire : deux assurés, ou deux ayants droit nés le même jour avec le même rang. Un assuré et un ayant droit de même NIR sont deux personnes d'une même famille (À VÉRIFIER : absent de docs/ref).
  - Un doublon possible **ne bloque jamais** la création. L'utilisateur ouvre la fiche existante ou clique sur « Créer quand même ». Le bouton principal vient en premier : la touche Entrée ne confirme jamais un doublon. Une création confirmée malgré des doublons est notée dans le détail de la ligne CREATE.
  - La recherche des doublons porte sur **toute l'organisation**. Un doublon d'un centre hors des droits de l'utilisateur ne révèle que le nom du centre (« contactez l'administrateur »), jamais l'identité ni un lien (choix validé à l'étape 3).
- **Fusion** :
  - réservée à l'**ADMIN et à l'AUDIO** ayant accès aux centres des deux fiches (choix validé à l'étape 3) ;
  - choix champ par champ, l'adresse et chaque couverture formant des blocs indivisibles. Par défaut, on garde la valeur de la fiche conservée, ou celle du doublon si la conservée est vide. Les notes sont concaténées ;
  - **fusion logique** : le doublon reçoit `fusionne_dans_id` et `fusionne_le` et n'est jamais supprimé. Il disparaît des listes, de la recherche et des doublons, et son URL renvoie vers la fiche conservée. Les fiches déjà fusionnées dans le doublon sont rattachées à la fiche conservée ;
  - journal : deux lignes READ à l'ouverture de l'écran, deux lignes UPDATE avec `details.fusion`.
- **Audit** : tous les champs patient sont journalisés « modifié » sans valeur, sauf `centreId` (identifiant technique).
- **Origine AMO** : `SAISIE` ou `VITALE`. Une modification manuelle de la couverture la repasse en `SAISIE`, la date de dernière lecture Vitale restant affichée.

### Conséquences

- Recherche par nom en `contains` sur des colonnes indexées en B-tree : l'index ne sert pas pour une sous-chaîne. Suffisant pour quelques milliers de fiches par centre ; à revoir (pg_trgm) si la volumétrie l'exige.
- Les jumeaux de même nom sont signalés comme doublons possibles (même nom et même date de naissance). La règle de la spécification le veut ; l'utilisateur confirme la création.
- Une couverture par type et par patient pendant le MVP. Pas d'historique des couvertures.
- La durée de conservation d'une fiche fusionnée et la purge relèvent de l'étape 15 (RGPD).

---

## ADR-007 – Lecture de la carte Vitale simulée

- **Date** : 2026-10-29
- **Statut** : acceptée

### Contexte

L'étape 4 branche la lecture de la carte Vitale derrière le port `VitaleReader`, avant l'intégration réelle par AreaFSE (étape 17). La documentation AreaFSE (docs/vendor/areafse) n'est pas encore déposée. La lecture doit mener à une fiche patient (mise à jour ou création) et être historisée sans conserver le contenu de la carte. Sources dans docs/ref : convention-audioprothesistes.pdf, art. 27 (p. 27) et art. 35 § 1 (p. 32) pour la vérification des droits sur la carte (physique ou application), art. 29 (p. 27) pour les bénéficiaires de la C2S.

### Décision

- **Port provisoire** : `readCard(): Promise<VitaleReadResult>`. Bénéficiaires (nom, prénom, date de naissance, rang, NIR, qualité, régime, caisse, centre gestionnaire, période de droits AMO, C2S, ALD, AMC éventuelle), source `CARTE` ou `APCV`, instant de lecture fourni par le `Clock`. Les échecs lèvent `ErreurLectureVitale` avec un code typé. La structure sera alignée sur AreaFSE (À VÉRIFIER). Le service revalide tout résultat par Zod, quel que soit l'adaptateur ; un résultat hors contrat donne `CARTE_INVALIDE`, une erreur imprévue `ERREUR_TECHNIQUE`.
- **Lecteur simulé** : `FakeVitaleReader` lit `fixtures/vitale/*.json` (format propre, validé par Zod). La carte insérée ou l'incident simulé est choisi par un sélecteur, mémorisé dans le cookie `ha_vitale_simulation`. Il n'est actif qu'avec `VITALE_LECTEUR=simulation` et hors production. Le nom de fichier est contrôlé (pas de traversée de chemin). Sinon, `LecteurVitaleAbsent` répond `AUCUN_LECTEUR`.
- **Historique** : table `lecture_vitale`, en ajout seul (trigger), une ligne par lecture, réussie ou non : utilisateur, horodatage, centre courant s'il est unique, résultat (`SUCCES` ou code d'erreur), source, nombre de bénéficiaires. Aucun nom, NIR ni droit. Le lien avec un dossier passe par le journal d'audit : `details.lectureVitale` sur les lignes READ (comparaison), UPDATE et CREATE.
- **Lecture en cours** : le résultat n'est jamais écrit en base. Il est compressé, chiffré en AES-256-GCM (contexte `vitale.lecture.<id utilisateur>` : un jeton ne s'ouvre pas pour un autre compte), puis placé dans le cookie `ha_vitale_lecture`. Ce cookie est HttpOnly, SameSite=Strict, Secure en production, limité au chemin `/patients/vitale` et valable 15 minutes. Il est effacé après une mise à jour, une création ou « Terminer la lecture ». Le NIR ne figure jamais dans une URL : seuls l'index du bénéficiaire et l'identifiant de la fiche y passent.
- **Correspondance** : une fiche désigne le bénéficiaire selon la règle « même bénéficiaire » de l'ADR-006 (même empreinte de NIR, et soit deux assurés, soit deux ayants droit de même date de naissance et de même rang). L'empreinte et le rang seuls confondraient les enfants d'une même famille (choix validé à l'étape 4). La recherche porte sur toute l'organisation ; hors périmètre, seul le centre est révélé, comme pour les doublons.
- **Comparaison** : champ par champ (nom, prénoms, date de naissance, puis chaque champ AMO). La couverture AMO forme un bloc si la fiche n'en a pas, et l'AMC est toujours un bloc indivisible.
  - Les noms et prénoms se comparent sans accents ni casse, et le prénom de la carte peut n'être que le premier de la fiche.
  - Le nom de la carte met à jour le nom d'usage s'il est renseigné, sinon le nom de naissance.
  - « Mettre à jour » est proposé par défaut ; chaque champ peut être refusé.
  - Toute fiche accessible peut être comparée (ex. fiche créée sans NIR, ouverte depuis la fiche d'origine). L'écran avertit quand la fiche ne porte pas le NIR du bénéficiaire.
- **Origine AMO après lecture** : `VITALE` si la couverture enregistrée est identique à celle de la carte, `SAISIE` sinon (mise à jour refusée en partie, formulaire de création retouché). La date de dernière lecture prend l'instant de la lecture.
- **Création pré-remplie** : formulaire patient habituel (doublons compris). Civilité et sexe restent à choisir : le lien entre NIR et sexe n'est pas dans docs/ref, et un ayant droit porte le NIR de l'assuré.
- **Droits et C2S** : `etatDroitsAmo` compare la période de droits au jour de la lecture ou de la consultation. Un bandeau s'affiche si les droits sont expirés ou pas encore ouverts. Le badge C2S figure dans l'en-tête commun du dossier (`EntetePatient`) et dans la liste.

### Conséquences

- Remplacer la simulation par AreaFSE ne touche que l'adaptateur et, si besoin, le schéma du résultat. Les fixtures et les tests d'intégration resteront la référence du comportement attendu.
- Une carte familiale nombreuse doit tenir dans un cookie (4 Ko) : la compression suffit pour les cartes fictives, à vérifier avec des cartes réelles et AreaFSE.
- L'historique des lectures n'a pas encore d'écran de consultation.
- La date de début des droits AMO n'est pas stockée. Les droits sont vérifiés au jour de la lecture ; la convention les apprécie à la date de délivrance (art. 27), ce qui sera contrôlé avec la facture (étape 11).

## ADR-008 – Référentiels : base LPP, catalogue, prescripteurs

- **Date** : 2026-10-30
- **Statut** : accepté

### Contexte

La base LPP est diffusée par ameli en fichiers dBase : `lpp_fiche_tot`, `lpp_histo_tot`, `lpp_comp_tot`, `lpp_incomp_tot`. Aucun dictionnaire des champs ni table de correspondance générique/spécifique n'accompagne la version 908. Les règles et le devis ont besoin du tarif applicable à une date, et le dépôt ne doit pas contenir la base complète.

### Décision

- **Périmètre** : fiche et historique du seul titre II chapitre 3 (`ARBO1 = 2`, `ARBO2 = 3`), soit 846 codes en 908 ; `comp` et `incomp` en entier, tels quels, sans clé étrangère.
- **Historisation** : chaque version est un instantané complet et immuable, clé `(version, code)` pour la fiche, `(version, code, debutValidite)` pour le tarif. Le tarif applicable se lit dans la dernière version, à la date voulue. Une version plus ancienne importée après coup ne remplace rien.
- **Réimport** : la version est supprimée puis réécrite dans une seule transaction, après validation complète des fichiers. Les clés primaires interdisent tout doublon.
- **`LppCode`** : table stable, cible des clés étrangères du catalogue. Un code disparu d'une version reste référencé.
- **Lignes brutes** : colonnes typées pour les champs connus, plus une copie intégrale (`brut`) : rien n'est perdu, et un champ de sens inconnu n'est pas interprété.
- **Prix limite** : `PUREGLEMEN`, 0 signifiant « pas de plafond ». Recoupé avec le guide ameli pour la classe I uniquement.
- **Code générique** : déduit d'`OLD_CODE` pour un code `7xxxxxx`, si `OLD_CODE` désigne un code importé (273 sur 273 cohérents en 908). Une table officielle, si elle est déposée, primera.
- **Fin de validité** : la date de fin de la fiche borne l'historique (507 codes de la section 6.1 sont clos dans la fiche et ouverts dans l'historique).
- **Lecteur dBase maison**, sans dépendance : format fixe et simple.
- **Commande dans `apps/web`** : `apps/web/scripts/import-lpp.ts` appelle `server/lpp/importer.ts`, à côté des tests d'intégration ; `pnpm --filter` changeant de dossier, le chemin reçu est résolu depuis `INIT_CWD`.
- **Catalogue et prescripteurs** : portée organisation. Un modèle porte une liste de codes (table de liaison), génériques ou spécifiques. Un `nom` de modèle s'ajoute à la gamme. RPPS du prescripteur facultatif et unique, pour permettre la création à la volée.
- **Droits** : catalogue en écriture ADMIN ; prescripteurs créés par les 3 rôles, modifiés et désactivés par l'ADMIN.

### Conséquences

- Une version occupe environ 15 000 lignes, dont 13 646 liens : volume négligeable, mais `lpp_lien` grossit à chaque version.
- Les DBF complets ne sont pas versionnés : chaque environnement les dépose et lance `pnpm import:lpp`. Le seed amorce les 8 codes génériques (`LppCode` seul, sans tarif) pour fonctionner sans import.
- La date stockée est celle de l'en-tête des DBF ; la date d'actualisation de la note `.doc` n'est pas lue.
- Le rattachement d'un modèle aux codes spécifiques `7xxxxxx` n'est pas automatisé : le nom en fin de libellé est un texte libre, tronqué à 80 caractères, et le code à facturer reste à confirmer (`RJT` n'est défini dans aucun document de docs/ref).
- `SelecteurPrescripteur` n'est branché sur aucun dossier avant l'étape 8.

---

## ADR-009 – Moteur de règles audio

- **Date** : 2026-10-30
- **Statut** : acceptée

### Contexte

L'étape 6 code les règles qui décident des prix, des remboursements et de la conformité du devis. `docs/REGLES_AUDIO.md` les compare aux documents de docs/ref : plusieurs sont absentes (qualité du prescripteur, plafond du contrat responsable, validité de l'ordonnance, quotas de piles) ou contradictoires (borne des 20 ans). Le texte de la nomenclature LPP n'est pas dans docs/ref. Le domaine doit rester sans I/O alors que les montants viennent de la base LPP.

### Décision

- **Module** : `packages/domain/src/audio-rules`, des fonctions pures, un fichier et un test par règle. `constantes.ts` est le seul fichier de constantes, chacune avec sa valeur, sa date d'effet et sa source. Une date inconnue vaut `null`.
- **Montants LPP** : prix limites et bases ne sont pas des constantes. `tarifsAudioDepuisLpp` les extrait des codes 2351057 et 2325120, `tarifsAudioEnVigueur` (`apps/web/server/services/lpp.ts`) les lit à une date, et les fonctions les reçoivent en second argument (`TarifsAudio`). La signature demandée gagne donc un paramètre : `plafondPrixVente`, `baseRemboursement`, `controleDevis`.
- **Borne des 20 ans** : lecture d'ameli, âge révolu ≥ 20 ans (À VÉRIFIER, libellés LPP contraires).
- **Date de référence de l'âge** : date de délivrance, pour toutes les règles liées à l'âge (À VÉRIFIER).
- **Règles sans source** : codées à partir de la table fournie par le métier, marquées À VÉRIFIER, en avertissement dans `controleDevis`, jamais en erreur bloquante (prescripteur, 1 700 €). Validité de l'ordonnance et quotas de piles : rien n'est contrôlé, aucune valeur inventée.
- **C2S** : le plafond est celui de la C2S, sauf option `refusOffreC2S` (plafond général et avertissement de dépassement). `surdicecite` porte le plafond C2S à 1 400 € à tout âge.
- **Ventilation** : l'AMO se calcule sur min(prix, base), arrondie au centime le plus proche. Le taux reste fourni par l'appelant, la table FR 201 ne couvrant ni l'ALD, ni l'accident du travail, ni la SNCF.
- **Dates** : arithmétique calendaire dans `commun/date.ts`, sans `new Date()`. Un mois d'arrivée trop court donne son dernier jour.
- **Résultats** : codes stables et libellés français séparés (`CODES_CONTROLE`, `LIBELLES_CONTROLES`), à la manière des autres modules du domaine.

### Conséquences

- Pas de changement de schéma. `surdicecite`, `refusOffreC2S` et le type d'appareillage par oreille seront à porter par le dossier et le devis (étapes 8 et 9).
- `eligibiliteRenouvellement` ne voit que les délivrances locales : son résultat reste indicatif, le téléservice de l'Assurance Maladie fait foi.
- Avant le 07/07/2023, la base 908 n'a pas de ligne pour ces codes : `tarifsAudioEnVigueur` renvoie `null`. À traiter pour la reprise Cosium (étape 13) si des délivrances antérieures doivent être recalculées.
- Le dépôt du texte de la nomenclature LPP permettra de lever la plupart des À VÉRIFIER, listés dans `docs/REGLES_AUDIO.md`.
- Compléments aux ADR précédentes, qui restent inchangées. ADR-007 : l'art. 27 de la convention est en p. 26, pas 27. ADR-008 : depuis le 07/07/2023, les codes génériques portent la nature `RJT` et seuls les codes 7xxxxxx portent P1D, P1G, etc. ; le sens de `RJT` reste à confirmer.

## ADR-010 – Stock au numéro de série

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

L'étape 7 suit chaque aide auditive par son numéro de série, et les accessoires et piles en quantité par centre. La convention (art. 21, p. 21) impose de conserver le numéro de série des aides délivrées, le bon de livraison et la facture du fabricant, et d'identifier rapidement les assurés détenteurs d'un dispositif. La table des dossiers n'existe pas encore (étape 8). Le dépôt n'avait ni machine à états ni écriture concurrente à protéger.

### Décision

- **Modèle** : `Appareil`, `MouvementAppareil`, `StockAccessoire`, `MouvementAccessoire` (migration `stock`). Les mouvements sont en ajout seul (trigger). Un appareil ne se supprime pas, même au-delà de la durée de conservation, que docs/ref ne donne pas.
- **Machine à états** : `packages/domain/src/stock/etats.ts`, table des transitions dans `etats.test.ts` (les 49 couples). VENDU ne s'atteint que depuis EN_ESSAI. VENDU → EN_STOCK passe uniquement par `annulerVente`.
- **Patient porteur** : RESERVE, EN_ESSAI et PRET exigent un patient. EN_ESSAI ou PRET → SAV le détache : l'appareil en panne n'est pas celui du patient. VENDU → SAV le conserve. Un appareil en SAV ou en retour fabricant avec un patient est donc un appareil vendu, qui ne revient qu'en VENDU, et un appareil sans patient ne revient qu'en EN_STOCK. Le mouvement garde le patient qui détenait l'appareil, même une fois détaché.
- **Dossier** : `dossierId` sans clé étrangère, toujours nul à cette étape, car aucun identifiant ne pourrait être vérifié.
- **Unicité** : `(fabricant_id, numero_serie)`, sur la forme normalisée (espaces retirés, majuscules). `fabricantId` est copié sur l'appareil ; la clé composite `(modele_id, fabricant_id)` en `ON UPDATE RESTRICT` interdit de changer le fabricant d'un modèle en stock.
- **Concurrence** : `appliquerMouvement` est la seule écriture de `statut`, `centreId` et `patientId` (hors fusion de patients). Son `updateMany` est conditionné à l'état lu : en READ COMMITTED, le perdant attend le verrou, le `WHERE` est réévalué, aucune ligne ne correspond et `ErreurConflitStock` annule la transaction. Le formulaire envoie aussi le statut ou le centre affiché : celui qui lit après le commit du gagnant reçoit le même conflit, pas un refus de transition. Accessoires : incrément et décrément atomiques, `CHECK quantite >= 0`.
- **Droits** : tous les rôles agissent dans leurs centres. Sont réservés à l'ADMIN l'annulation d'une vente, le prix d'achat (fiche, saisie, CSV) et la correction du numéro de série ou du modèle, possible tant que seul le mouvement de réception existe.
- **Transfert** : immédiat, sans statut de transit, depuis EN_STOCK seulement. Le centre d'arrivée n'a pas besoin d'être rattaché à l'utilisateur. Une ligne d'audit par centre.
- **Cloisonnement** : la recherche par numéro de série couvre l'organisation ; hors périmètre, seuls le modèle et le centre sont révélés (même principe que l'ADR-006). Sur la fiche, l'identité et le motif d'un mouvement lié à un patient hors droits sont retirés. Une ligne READ par patient affiché. Le sélecteur de patient cherche dans le centre de l'appareil, pas dans le périmètre courant.
- **Motifs chiffrés** : texte libre susceptible de citer l'état de santé, comme `patient.notes` ; jamais recopié dans le journal d'audit. Motif obligatoire pour tout mouvement sauf la réception.
- **Réception** : tout ou rien, comme un import CSV, 200 numéros au maximum. La douchette se comporte comme un clavier ; aucun pilote.
- **Fiche** : lue sur le client et non sur la connexion de la transaction de `withAudit`, car Prisma charge les relations imbriquées en parallèle, ce que `pg` déprécie sur une même connexion.

### Conséquences

- Une nouvelle écriture d'état doit passer par `appliquerMouvement`, sinon l'historique diverge. L'étape 8 ajoutera la clé étrangère de `dossierId` ; les étapes 10 et 11 appelleront `changerStatut` avec un dossier. D'ici là, l'essai et la vente se saisissent à la main sur la fiche.
- Un appareil remplacé par le fabricant sous un nouveau numéro reste en RETOUR_FABRICANT ; le remplaçant est une nouvelle réception. Aucun lien entre les deux n'est modélisé.
- La reprise Cosium (étape 13) créera des appareils dans leur état réel, sans passer par la machine à états.
- Rien ne recherche encore les détenteurs d'un modèle (matériovigilance, art. 21), et aucun numéro de lot n'est stocké (rappel de lot, même article).
- `reponseCsv` (`apps/web/server/csv.ts`) reprend la réponse en flux de l'export du journal, qui l'utilise désormais.
