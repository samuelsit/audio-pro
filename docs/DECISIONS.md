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

## ADR-011 – Dossier d'appareillage, prescription et documents

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

L'étape 8 crée l'objet central du parcours et enregistre la prescription avec son scan. Le port `DocumentStore` n'existait pas, aucune délivrance n'était stockée, et `eligibiliteRenouvellement` attendait un historique. Le devis normalisé (p. 1) demande le type d'appareillage oreille par oreille, avec la date du précédent appareillage. La convention impose de conserver la prescription (art. 21) et de la joindre à la facturation (art. 28).

### Décision

- **Machine à états** : `packages/domain/src/dossier/etats.ts`, les 100 couples dans `etats.test.ts`. Uniquement l'étape suivante, pas de retour arrière. ABANDONNE est possible de BROUILLON à EN_ESSAI, avec motif, réservé à ADMIN et AUDIO : au-delà, l'aide est délivrée. CLOS et ABANDONNE sont terminaux. Choix d'organisation, pas une règle.
- **Écriture du statut** : `appliquerTransition` seule, avec un `updateMany` conditionné au statut lu (même principe que l'ADR-010), et une ligne `TransitionDossier` en ajout seul, qui donne les dates de la frise. Les écrans n'offrent pas de changement de statut générique : les étapes 9 à 11 l'appellent après leurs propres contrôles.
- **Type par oreille** : `typeDroite` et `typeGauche`, CHECK en base (renseigné si et seulement si l'oreille est concernée). Le type global (Primo, Renouvellement, Mixte) est calculé. Les types du domaine s'appellent `PRIMO` et `RENOUVELLEMENT`.
- **`Delivrance`** : une ligne par oreille, origine `DOSSIER` ou `REPRISE`, écrite par les étapes 11 et 13. L'historique lu couvre tous les centres de l'organisation. La table suit la fusion de patients, donc pas en ajout seul.
- **Contrôle** : `controlePrescription` applique le délai à la **première délivrance possible** (jour + 30 jours d'essai), l'âge de R10 à la même date. Comparer à la date du jour refuserait à tort pendant les 30 derniers jours (À VÉRIFIER, R8).
- **Blocage** : le renouvellement avant délai est une erreur à la prescription, et reste un avertissement dans `controleDevis`. Un refus n'écrit rien, ni en base ni au stockage. La date future est une erreur de saisie, jamais forçable. La qualité du prescripteur reste un avertissement (ADR-009).
- **Forçage** : ADMIN seul, vérifié côté serveur, motif obligatoire, sans effet s'il n'y a rien à forcer. Le motif est **chiffré sur la prescription**, jamais recopié dans le journal : texte libre susceptible de citer l'état de santé (même principe que l'ADR-010). Le journal trace le fait, l'auteur, les codes forcés et la prescription.
- **Prescriptions en ajout seul** : une correction ajoute une version, possible en BROUILLON et PRESCRIPTION_OK, figée dès DEVIS_EMIS. La plus récente fait foi, les anciens scans restent (art. 21). Les constats sont conservés en JSON, codes seuls.
- **Scan** : obligatoire. PDF, JPEG ou PNG, 10 Mo au maximum, type lu dans la signature du fichier. Le nom d'origine n'est pas conservé : il peut contenir une identité. La clé d'objet est aléatoire, sans donnée patient. Chaque ouverture écrit une ligne READ.
- **Documents chiffrés** : `DocumentStoreChiffre` enveloppe tout adaptateur, Fake compris, avec AES-256-GCM et le trousseau de l'ADR-005. Enveloppe binaire `v1.<idCle>.` puis IV, tag et chiffré, pour éviter le surcoût du base64. Le contexte authentifié contient la clé de l'objet.
- **Ordre d'écriture** : contrôle, dépôt du scan hors transaction, puis transaction (prescription, transition, audit). Si elle échoue, l'objet déposé est retiré.
- **`@aws-sdk/client-s3`** : version exacte 3.1160.0, le dépôt n'ayant pas de client S3. Dépendance d'adaptateur, sans effet sur le domaine.
- **Envoi du fichier** : `bodySizeLimit` et `proxyClientMaxBodySize` à 12 Mo. Le formulaire envoie par `onSubmit` : une action de formulaire le réinitialiserait et ferait perdre le fichier au moment de forcer.
- **`surdicecite`** : donnée de santé, chiffrée sur le dossier en texte `OUI`/`NON`, comme l'ALD (ADR-006).
- **Accès** : par le centre du dossier, qui peut différer de celui de la fiche (`lireFiche` reçoit `accesVerifie`). La création exige l'accès à la fiche et au centre. L'audioprothésiste doit exercer dans ce centre.

### Conséquences

- D'ici les étapes 11 et 13, `Delivrance` n'est écrite que par le seed et les tests. Un patient réel sans ligne ressort éligible. Le résultat reste indicatif : le téléservice de l'Assurance Maladie fait foi (art. 22).
- Une vente hors prise en charge ou un renouvellement anticipé passe par un forçage ADMIN avant le devis. Le motif porte alors l'accord de la caisse.
- Un dossier préparé plusieurs mois avant l'échéance des 4 ans reste refusé.
- Le chemin d'une nouvelle écriture de `statut` passe par `appliquerTransition`, sinon la frise diverge.
- L'étape 9 reprend le type par oreille et lit `Delivrance` pour la date du précédent appareillage. Rien ne relance le contrôle si une délivrance apparaît après la prescription.
- Un scan orphelin reste possible si la suppression échoue après une transaction en erreur : invisible, chiffré, sans référence en base.
- Le test S3 tourne contre MinIO en local seulement : le service `pgsty/minio` exige une commande que GitHub Actions ne permet pas de passer.
- Une notification (`notifier`) ne s'affiche qu'à un changement de chemin : l'abandon revient donc sur la liste des dossiers du patient.
- Complément à l'ADR-010 : `mouvement_appareil.dossier_id` porte sa clé étrangère. La saisie passe à l'étape 10, où l'essai est piloté depuis le dossier.

## ADR-012 – Devis normalisé, versions et signature

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

L'étape 9 crée, contrôle et imprime le devis. Le modèle officiel (Annexe I) place la signature du patient à l'issue de l'essai, alors que la machine à états de l'ADR-011 mettait `DEVIS_SIGNE` avant `EN_ESSAI`. Il exige des mentions absentes du catalogue et des prix HT, sans qu'aucun document ne donne de taux de TVA. Le port `PdfRenderer` n'existait pas.

### Décision

- **Ordre du dossier** : `DEVIS_EMIS` → `EN_ESSAI` → `DEVIS_SIGNE` → `A_FACTURER`, comme le modèle (p. 1, p. 2 § 5). Complète l'ADR-011 : seul `STATUTS_DOSSIER` change, l'enum Prisma garde ses valeurs. Une exception au « pas de retour arrière » : `DEVIS_SIGNE` → `EN_ESSAI`, à l'émission d'une nouvelle version, la signature étant à recueillir de nouveau.
- **Gel** : `BROUILLON` → `EMIS` → `SIGNE`, ou `REMPLACE` quand une version suivante est émise. L'émission fige déjà : le patient détient une copie, son numéro doit garder son contenu. Toute modification crée un brouillon v+1 du même numéro, et la version en vigueur le reste jusqu'à l'émission de la suivante. Des triggers refusent toute écriture hors de ce chemin ; deux index partiels garantissent un brouillon et une version en vigueur par dossier.
- **Refus** : pas de statut dédié. On abandonne le dossier ou on émet une version. Plus de version à partir de `A_FACTURER`. Une signature après la date de validité est refusée, choix d'organisation.
- **Offres** : l'offre 1.1 est obligatoire, classe I. L'autre offre est facultative (convention art. 18 3°, « le cas échéant ») ; sa rubrique reste imprimée.
- **Lignes** : les prestations n'ont pas de ligne chiffrée, elles sont comprises dans le prix (modèle p. 1 et § 4). Piles, accessoires et produits d'entretien vont dans la ligne « Consommables, piles et accessoires », seule prévue. Instantané JSON du catalogue sur chaque ligne.
- **Montants** : le TTC est la référence, le HT s'en déduit. TVA conservée sur la ligne, en pour dix mille (R18, À VÉRIFIER). AMC saisie par poste (droite, gauche, consommables). AMC inconnue : montants AMC et reste à charge vides au PDF (« si connu »), le reste après AMO s'affiche à l'écran. Montants et avertissements conservés en JSON à l'émission : un changement de tarif ne touche pas un devis émis.
- **Date du devis** : celle de l'émission, et non de la rédaction. La fin de validité s'en déduit, un brouillon ne pouvant pas vieillir à tort. La délivrance prévue est la première possible (jour + 30 jours, R2).
- **PDF** : HTML pur produit par le domaine, textes du modèle mot pour mot dans `devis/modele.ts`, y compris ses coquilles et mentions anciennes. Chromium via `playwright-core`, version exacte, JavaScript coupé, requêtes refusées. Un navigateur par rendu. Le PDF est stocké chiffré : le réimprimer rend le document remis, et chaque ouverture écrit une ligne PRINT.
- **Rubriques manuscrites** : les § 3 et § 5 (offres choisies, signatures) sortent vierges : ils se remplissent sur le papier. L'application enregistre ensuite les choix, et le scan signé fait foi.
- **En-tête** : le centre du dossier, qui est le centre courant dès qu'un centre est sélectionné. L'ADMIN en « Tous les centres » garde ainsi un en-tête valable.
- **Signature** : dépôt du scan puis enregistrement, en deux gestes. L'assistante peut déposer ; seuls ADMIN et AUDIO enregistrent, avec la case « signé ». `SignatureDevis`, en ajout seul, porte `mode` (`SCAN`, `ELECTRONIQUE`) et `preuve`, nullable : la signature électronique n'exigera pas de migration de structure.
- **Droits** : l'assistante rédige, imprime et dépose ; émettre et signer sont réservés à ADMIN et AUDIO. Choix d'organisation.
- **Numéro** : `AAAA-NNNNNN` par organisation, compteur en table, incrément atomique, sans rapport avec un texte. Imprimé avec sa version.
- **Chiffrement** : lignes et offres non chiffrées, comme `Appareil` et `Dossier.oreilles`. Le NIR n'est écrit ni en base sur le devis, ni au journal : il n'existe en clair que dans le PDF, chiffré au stockage.
- **Catalogue** : mentions nullables, le manque bloque à l'émission. Colonnes CSV ajoutées, vides autorisées.
- **Fiche technique** : case déclarative pour le MVP.
- **Prix conseillé de classe I** : contrôle abandonné, `controleDevis` bloque le prix réel.

### Conséquences

- L'étape 10 reprend `demarrerEssai` et doit ajouter le contrôle de fin d'essai avant signature : à ce stade, rien n'empêche de signer le jour même.
- Le format d'import CSV change : tout fichier existant doit ajouter les nouvelles colonnes, vides si besoin.
- Un serveur de production doit disposer de Chromium (`PDF_CHROMIUM_CHEMIN`), à traiter avec le déploiement. Le test réel de l'adaptateur et l'E2E ne tournent pas en CI.
- Sans base LPP importée, un brouillon s'enregistre mais ne se calcule pas et ne s'émet pas.
- Un dépassement de page (nombreux consommables, mentions très longues) ferait passer le PDF à 3 pages : les deux pages du modèle ne tiennent qu'avec un contenu raisonnable, vérifié sur la démonstration.
- Une notification ne s'affiche qu'à un changement de chemin (ADR-011) : l'émission et la signature se voient au statut du devis.

## ADR-013 – Période d'essai

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

L'étape 10 branche `etatEssai`, jusqu'ici inutilisé, et pilote le stock depuis le dossier. Son énoncé démarrait l'essai depuis `DEVIS_SIGNE`, ce que l'ADR-012 a écarté : le devis n'engage pas « jusqu'à la signature du point 5 » (p. 1) et la signature vient « à l'issue de la période d'essai » (p. 2 § 5). L'énoncé demande aussi des appareils « réservés au patient » après l'achat, alors que l'ADR-010 ne connaissait pas de retour de l'essai vers `RESERVE`.

### Décision

- **Ordre** : celui de l'ADR-012, validé pour cette étape. `DEVIS_EMIS` → démarrage avec les numéros de série → `EN_ESSAI` → signature → `DEVIS_SIGNE` → achat → `A_FACTURER`. La machine à états du dossier ne change pas.
- **Modèle** : `Essai` (un par dossier), `EssaiAppareil`, `EssaiRdv`, `ProlongationEssai` (migration `essai`). Le patient et le centre se lisent sur le dossier : la fusion de patients n'a rien à faire. Compte rendu, motif de prolongation et motif de retrait sont chiffrés, jamais recopiés dans le journal.
- **Un appareil, un essai** : deux index uniques partiels sur `essai_appareil` (`retire_le IS NULL`), par oreille et par appareil. Le perdant d'une concurrence échoue d'abord sur le `updateMany` conditionné d'`appliquerMouvement` ; l'index reste le dernier rempart.
- **Lien actif** : il subsiste après l'achat, jusqu'à la vente. Il tient l'appareil : `changerStatut` refuse tout changement manuel, et la fiche renvoie vers le dossier. Un appareil en panne passe par un changement, puis part au SAV depuis le stock.
- **Stock** (complète l'ADR-010) : ajout de `EN_ESSAI` → `RESERVE`, patient conservé, pour l'achat. `verifierTransitionManuelle` réserve au dossier l'entrée en essai et cette réservation. `dossierId` est enfin saisi sur les mouvements (reporté des ADR-010 et 011). Le mouvement d'un appareil rendu garde le patient qui le détenait.
- **Choix de l'appareil** : numéro de série saisi ou lu à la douchette, avec une aide à la saisie (`datalist`). Modèle de la ligne de l'offre d'essai, stock du centre du dossier, `EN_STOCK` ou `RESERVE` pour ce patient. Le centre se contrôle en premier : le statut d'un appareil hors du centre n'est pas révélé (ADR-010).
- **Date de début** : le jour du démarrage, sans saisie. Elle ne bouge plus, même après un changement d'appareil.
- **Signature** (annoncée par l'ADR-012) : `blocagesSignature` refuse avant l'échéance et sans 2 rendez-vous, jugés à la date de signature, sans forçage car ce sont des minimums du texte. Elle refuse aussi un appareil actif d'un autre modèle que l'offre retenue, contrôle de cohérence : un changement de modèle impose de retenir l'offre qui le porte ou d'émettre une version. Le dépôt du scan reste libre.
- **Changement** : possible en `EN_ESSAI` seulement. Après la signature, une nouvelle version rouvre l'essai (ADR-012).
- **Achat** : depuis `DEVIS_SIGNE`, réservé à ADMIN et AUDIO, même partage que la signature. Aucune `Delivrance` n'est écrite : la date de délivrance sera celle de la facturation (devis p. 2 § 5).
- **Abandon** : `abandonnerDossier` reste le point d'entrée unique. Il clôt l'essai ouvert et remet ses appareils en stock dans la même transaction.
- **Rendez-vous** : traces en ajout seul, datées entre le début de l'essai et aujourd'hui, sans agenda : Doctolib le reste. Compte rendu obligatoire.
- **Droits** : démarrage, rendez-vous, prolongation et changement ouverts aux 3 rôles, comme le stock (ADR-010).
- **Compte rendu** : PDF rendu à la demande, non stocké, à la différence du devis : il n'est pas figé tant que l'essai vit. Une ligne PRINT, écrite après le rendu. Nom de fichier sans identité, ni NIR ni montant.
- **Dépendances** : `essais-socle.ts` ne dépend pas de `dossiers.ts`, qui l'appelle à l'abandon. Un import circulaire est ainsi évité.

### Conséquences

- L'étape 11 doit ajouter `RESERVE` → `VENDU`, fermer le lien à la vente et retirer le `VENDU` manuel de la fiche. Sans fermeture, le lien bloquerait une annulation de vente suivie d'un nouvel essai.
- Depuis la fiche, `EN_ESSAI` → `VENDU` ne reste possible que pour un appareil sans lien : aucun ne peut plus entrer dans cet état par l'application.
- Un dossier n'a qu'un essai : la nouvelle période après un échec (devis p. 2 § 3) reste à arbitrer. `dossierId` unique serait à lever.
- Un rendez-vous saisi par erreur ne se supprime pas et compte dans les 2 rendez-vous.
- Les embouts sur mesure facturables en cas d'abandon (devis p. 2 § 3) relèvent de la facture.
- Le dossier de démonstration en essai n'a pas de devis : il montre l'écran et le courrier, pas la signature. Son ordonnance n'a pas de scan.

## ADR-014 – Facture préparée, sans facturer

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

L'étape 11 branche `ventilation` et `codePrestation` sur le dossier `A_FACTURER`. Pendant le MVP, la FSE, la facture patient et l'encaissement se font dans Cosium : notre logiciel produit un dossier contrôlé, rien de plus. Le devis ne porte pas le code LPP d'une aide, et ses montants sont calculés à une délivrance prévue. La date de facturation marque la délivrance (devis p. 2 § 5), or cette facturation a lieu hors de notre logiciel. L'ADR-013 attendait la vente et l'écriture de `Delivrance` à cette étape.

### Décision

- **Ni numéro de facture ni encaissement, volontairement.** `FacturePreparee` n'a ni numéro, ni mode de règlement, ni montant encaissé. Ces données relèvent des obligations des logiciels de caisse, que seul Cosium assume pendant le MVP. Le texte qui les fixe n'est pas dans docs/ref (À VÉRIFIER). Ajouter un tel champ exige une nouvelle ADR.
- **Port `BillingEngine`** : non implémenté. Rien n'est facturé avant l'étape 17.
- **Lignes calculées à la lecture** : une ligne stockée deviendrait fausse après une relecture Vitale ou un changement de droits. `preparerFacture` recalcule tout, le devis signé ne fournissant que les articles, les prix et le taux AMO. Sont stockés : la date de délivrance, la confirmation AMO et la PEC. L'étape 12 figera le contenu exporté. `VENTILATION_INCOHERENTE` est un filet de sécurité : `ventilation` garantit déjà la somme.
- **« Prêt à exporter » est calculé**, sans colonne ni bouton : aucune erreur = prêt. Un état stocké vieillirait avec les droits et la lecture. L'export relancera les contrôles.
- **Date de délivrance** : stockée, le jour de l'achat par défaut, entre la signature et aujourd'hui. Base, âge, droits et tarifs s'y lisent (art. 27, R2).
- **Vente reportée à l'étape 12** (modifie la conséquence de l'ADR-013) : `RESERVE` → `VENDU`, fermeture du lien d'essai, retrait du `VENDU` manuel, écriture de `Delivrance` et sortie de stock des piles et accessoires, au passage à `FACTURE_EXTERNE`, quand Cosium confirme la facture. Écrire une délivrance avant annoncerait à l'historique des 4 ans une facture qui n'existe pas. Choix validé le 2026-10-31.
- **Code LPP** : voir R21. Un code générique lève un avertissement, pas une erreur, tant que le sens de `RJT` n'est pas confirmé (même principe que l'ADR-009).
- **Couverture à jour** : lecture de moins de 30 jours avant la délivrance, ou saisie confirmée (R22). La confirmation est portée par la facture, pas par la couverture : elle vaut pour ce dossier.
- **PEC** : une par dossier, modifiable tant que le dossier est `A_FACTURER`, rattachée à `dossierId` pour pouvoir précéder l'achat plus tard. Pas de chiffrement : ni NIR ni donnée de santé, comme `CouvertureAmc`. Le justificatif passe par `DocumentStoreChiffre`. Le journal note le statut, jamais le montant ni l'accord.
- **Contrôles ajoutés à l'énoncé** : prix au-dessus du plafond à la délivrance (un patient peut atteindre 20 ans pendant l'essai ou devenir C2S) et tarif LPP indisponible.
- **Lecture groupée** : `evaluerFactures` charge une page de dossiers en quelques requêtes `in` et sert la fiche comme la file. La file n'écrit pas de READ (ADR-006). Elle est évaluée en entier à chaque affichage, puis paginée : les compteurs Prêts et Bloqués en ont besoin, et un dossier n'y reste pas longtemps.
- **Droits** : les 3 rôles agissent dans leurs centres, comme l'essai.

### Conséquences

- Sans code `7xxxxxx` relié au modèle, chaque aide lève `CODE_LPP_GENERIQUE`. Si `RJT` signifie un rejet à la facturation, il faudra relier ces codes au catalogue avant l'étape 12, ou faire de cet avertissement une erreur.
- Un appareil de classe I vendu à un bénéficiaire C2S n'a pas de code de classe II sur sa fiche : il prend le générique, donc l'avertissement.
- La part AMC se calcule par dossier : une PEC accordée oreille par oreille est saisie en total et répartie au prorata.
- Le taux AMO reste celui du devis : un changement de régime après la signature ne le met pas à jour. `ECART_AMO_DEVIS` ne couvre que la base.
- Un patient reste `RESERVE` et absent de `Delivrance` tant que l'étape 12 n'existe pas. Son éligibilité au renouvellement n'en tient pas compte.
- Une `FacturePreparee` n'existe qu'à partir de cette étape : un dossier déjà `A_FACTURER` avant la migration n'aurait pas de ligne. Aucune base n'en contient.
- Les embouts sur mesure facturables après un abandon (devis p. 2 § 3) restent sans traitement : la préparation n'existe qu'après un achat.

---

## ADR-015 – SaaS complet, plus d'export vers Cosium

- **Date** : 2026-10-31
- **Statut** : acceptée. Remplace les ports de l'ADR-001 pour `LegacyExporter` et, dans l'ADR-014, tout ce qui suppose que la facture et l'encaissement restent dans Cosium.

### Contexte

Le logiciel n'est plus un outil interne qui prépare un dossier pour Cosium : c'est un SaaS multi-clients qui le remplace (nouveau `CLAUDE.md`, plan en 31 étapes). Aucun export n'avait été écrit : `LegacyExporter` n'existait que dans des commentaires, et aucun service n'écrivait `EXPORTE` ni `FACTURE_EXTERNE`.

### Décision

- **Cycle du dossier** : `A_FACTURER → FACTURE → CLOS`, comme au prompt 11. `EXPORTE` et `FACTURE_EXTERNE` disparaissent ; la migration convertit le premier en `A_FACTURER`, le second en `FACTURE`.
- **`FacturePreparee` reste** : la facture de l'étape 14 en partira. « Prêt à exporter » devient « Prêt à facturer ».
- **La vente, `Delivrance` et la sortie de stock** se rattachent à la validation de la facture (étape 14), plus à `FACTURE_EXTERNE`.
- **Cosium reste une source d'import**, à l'étape 29 : `fixtures/import-cosium` et les mentions de reprise sont conservés.
- **Numérotation** : `docs/PLAN.md` donne la correspondance entre anciennes et nouvelles étapes. Les ADR antérieures gardent l'ancienne, car une ADR acceptée ne se modifie pas.

### Conséquences

- Jusqu'à l'étape 14, aucun service n'atteint `FACTURE` : un dossier reste `A_FACTURER`, et l'historique des 4 ans reste vide pour lui, comme avant.
- Les ports `BillingEngine`, `PecGateway`, `Notifier`, `ESignature` et `NoahConnector` sont cités par `CLAUDE.md` mais n'existent pas encore : ils arrivent à leurs étapes.
- Le nom HA-Gestion, les paquets `@ha/*` et les bases `ha_*` restent en place : AudioGest est un nom de code, le renommage n'est pas demandé.

## ADR-016 – Isolation par client : RLS, rôles PostgreSQL et contexte explicite

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

Le cloisonnement reposait sur le `organisationId` écrit dans chaque requête. La base n'imposait rien, et le rôle `ha` est superuser, `BYPASSRLS` et propriétaire de toutes les tables : des politiques RLS seules n'auraient eu aucun effet. `organisationId` est conservé tel quel plutôt que `organizationId`, pour rester cohérent avec le schéma en français ; `CLAUDE.md` est aligné sur ce mot.

### Décision

- **Quatre rôles** : `ha` (migrations, seed, import LPP, tests), `ha_app` (l'application, soumise à la RLS), `ha_plateforme` (`BYPASSRLS`, authentification et console, sans aucun droit sur les tables de données patient), `ha_jobs` (schéma `pgboss`). Les migrations les créent sans `LOGIN` ; `pnpm db:roles` pose les mots de passe.
- **Pas de `ALTER DEFAULT PRIVILEGES`** : une table nouvelle reste inaccessible tant qu'elle n'a pas ses `GRANT` et sa politique.
- **`organisation_id` sur chaque table métier**, rempli par un trigger d'héritage depuis le parent, lu à travers la RLS : un parent d'un autre client donne `NULL`, refusé par `NOT NULL`. La valeur par défaut `app_organisation_id()` dispense de le passer dans les créations imbriquées.
- **`session`, `compte`, `deux_facteurs`** n'ont pas la colonne : Better Auth les écrit et un SUPERADMIN n'a pas d'organisation. Leur politique suit l'utilisateur.
- **Politique** : `organisation_id = app_organisation_id()`, en `ENABLE` et `FORCE`. Sans contexte, la fonction renvoie `NULL` et rien ne passe.
- **Contexte explicite, sans `AsyncLocalStorage`** : `base(acteur)` et `enTransaction(acteur, …)`. L'acteur est déjà passé à chaque service : une requête sans contexte ne compile pas, et les générateurs CSV exécutés après le handler restent couverts. Chaque requête hors transaction part dans un lot `BEGIN`, `set_config(…, true)`, requête, `COMMIT`.
- **`prisma()` déménage dans `@ha/db/admin`**, interdit par ESLint dans l'application.
- **Unicités portées par client** : RPPS, ADELI, FINESS et numéro de facturation, pour qu'un doublon ne révèle pas un autre client. L'e-mail reste global : la connexion le cherche avant de connaître le client.
- **SUPERADMIN** : ligne de `utilisateur` sans organisation, garantie par un CHECK. Il ne reçoit jamais de service métier : `requireSession` le renvoie vers la console.
- **Journal** : les lignes sans organisation (compte inconnu) ne sont plus visibles d'aucun client. `journal.ts` les montrait à tous, ce qui aurait fuité entre clients.

### Conséquences

- Chaque requête isolée coûte trois allers-retours de plus. À mesurer à l'étape 23.
- Une clé étrangère ignore la RLS : sur une table à plusieurs parents, un service qui écrirait l'id d'un autre client sans le relire ne serait pas bloqué par la base. Les services relisent leurs références et les tests d'identifiant forcé le contrôlent. Clés composites à reprendre à l'étape 22.
- L'empreinte du NIR et le bucket S3 restent communs à tous les clients ; les recherches sont filtrées et les clés sont aléatoires. Séparation par client à arbitrer à l'étape 22.
- En production, le rôle des migrations ne sera pas superuser : il lui faudra `BYPASSRLS` pour remplir une colonne, à cause de `FORCE`, et `CREATEROLE` pour la migration des rôles. À traiter à l'étape 23, comme la création du premier SUPERADMIN.
- Le test `isolation.int.test.ts` échoue si une table n'est ni isolée ni déclarée globale.

## ADR-017 – Rôles d'un client

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

`ADMIN`, `AUDIO` et `ASSISTANT` ne couvraient ni le responsable de centre ni l'éditeur.

### Décision

- **`ADMIN` devient `ADMIN_CLIENT`** par `RENAME VALUE` : aucune ligne n'est réécrite, le journal en ajout seul n'est pas sollicité. Les anciennes lignes affichent le nouveau nom.
- **`RESPONSABLE_CENTRE`** : droits métier sur ses seuls centres, avec « Tous mes centres ». Il annule une vente, voit les prix d'achat, corrige l'identité d'un appareil, abandonne un dossier, émet un devis, enregistre une signature, confirme un achat, fusionne des patients. Il ne force pas une prescription (réservé à l'ADMIN_CLIENT au prompt 11) et n'accède pas à Administration.
- **« Tous mes centres »** : `centresDuPerimetre` borne le responsable à ses rattachements ; `null` reste réservé à l'ADMIN_CLIENT.
- **2FA** obligatoire pour ADMIN_CLIENT et SUPERADMIN.
- **`Role` du domaine** ne contient que les rôles d'un client : `SUPERADMIN` n'est pas assignable depuis un formulaire. `RoleCompte` couvre les deux.

### Conséquences

- La 2FA n'est pas imposée au responsable, qui voit pourtant les prix d'achat : à revoir à l'étape 22.
- Le responsable n'a pas d'écran de gestion de son équipe : à décider avec l'étape 21.

## ADR-018 – File de travaux sur PostgreSQL

- **Date** : 2026-10-31
- **Statut** : acceptée

### Contexte

Les envois, imports et clôtures à venir exigent une file, sans ajouter de service au socle.

### Décision

- **pg-boss** dans `packages/jobs`, schéma `pgboss` créé par la migration et possédé par `ha_jobs` (`createSchema: false` : ce rôle n'a pas le droit de créer un schéma).
- **Enveloppe Zod obligatoire** : `{ organisationId, cleIdempotence, charge }`. Un travail s'exécute toujours dans le contexte de son organisation, par `clientOrganisation` (`ha_app`).
- **Files `stately` avec `singletonKey`** : une même clé n'est pas mise deux fois en attente.
- **Ouvrier à part** : `pnpm jobs:worker`, avec un seul travail, `diagnostic`, en attendant les premiers besoins.

### Conséquences

- La clé protège la file, pas l'historique : une fois le travail terminé, la même clé repart. Chaque travail reste idempotent par lui-même, comme le demande `CLAUDE.md`.
- Un travail transverse (purge globale) n'a pas de place dans cette enveloppe : à décider à son arrivée.
- Mailpit est dans docker-compose, mais rien n'envoie encore d'e-mail : le port `Notifier` arrive à l'étape 8.

## ADR-019 – Références entre clients et charge sur les connexions

- **Date** : 2026-10-31
- **Statut** : acceptée. Complète l'ADR-016 : remplace sa conséquence sur les clés composites, et précise le contexte des travaux de l'ADR-018.

### Contexte

La revue de la branche a montré trois limites de l'ADR-016 et de l'ADR-018. Le trigger d'héritage ne contrôlait que l'`INSERT`, et un seul parent : un `UPDATE` ou une table à plusieurs parents pouvait référencer une ligne d'un autre client, car une clé étrangère ignore la RLS. Chaque requête ouvrant sa transaction, un service qui en lance dix en parallèle pouvait échouer faute de connexion. Une clé d'idempotence était commune à tous les clients.

### Décision

- **`verifier_meme_organisation`** : un trigger par référence entre tables d'organisation, généré depuis le catalogue PostgreSQL, en `BEFORE INSERT OR UPDATE OF` la colonne. Il s'applique aussi au rôle propriétaire. Un test compare les triggers aux clés étrangères : une référence nouvelle sans contrôle le fait échouer. Les clés composites ne sont plus nécessaires.
- **`organisation_id` est immuable** pour tous les rôles : une ligne ne change jamais de client.
- **Une migration postérieure doit recréer ces boucles** pour toute table nouvelle, ou appeler `verifier_meme_organisation` sur ses références.
- **Connexions** : 10 par client Prisma et par processus (`DATABASE_POOL_MAX`, sans effet sur pg-boss), attente de 10 s et transaction de 15 s, pour qu'une requête attende une connexion au lieu d'échouer.
- **Pas de lecture hors transaction dans `withAudit`** : `obtenirFicheAppareil` lit puis journalise, sans tenir une connexion.
- **Clé d'idempotence** : préfixée par l'organisation.
- **Travaux** : même chiffrement que l'application ; `CHAMPS_CHIFFRES` passe dans `@ha/adapters`.
- **Réactivation** : le SUPERADMIN choisit `ACTIF` ou `ESSAI`, le statut d'avant la suspension n'étant pas conservé. Elle est sans effet sur un client qui n'est plus suspendu.
- **Rôles sur une base de test** : un mot de passe n'est posé que sur un rôle encore sans `LOGIN`, car il vaut pour tout le cluster.
- **Limitation de débit** : une seule instruction `INSERT … ON CONFLICT`. La lecture suivie d'une écriture faisait échouer une connexion simultanée à une réinitialisation, et perdait des tentatives.

### Conséquences

- Chaque écriture relit ses parents : à mesurer avec les trois allers-retours de l'ADR-016, à l'étape 23.
- Les lignes de journal sans organisation (compte inconnu, connexions de la console) ne sont lisibles que par le rôle propriétaire. Une tentative d'intrusion sur la console est donc tracée, mais sans écran. La console reste minimale : à traiter à l'étape 22.
- Un travail n'écrit pas encore dans le journal d'audit : `withAudit` vit dans `apps/web`. À déplacer avec le premier travail qui touche un dossier patient.
- L'adresse retenue pour la limitation se lit depuis la fin de `x-forwarded-for`, selon `PROXIES_DE_CONFIANCE`. Sans proxy devant l'application, le client la choisit : à imposer au déploiement, à l'étape 23.
- Un travail n'a pas encore de transaction interactive avec contexte : à ajouter avec le premier qui écrit plusieurs lignes.
- `limitation_debit` grossit sans purge : premier candidat pour `packages/jobs`.

## ADR-020 – Agenda multi-centres

- **Date** : 2026-10-31
- **Statut** : acceptée. Remplace, dans l'ADR-013, « sans agenda : Doctolib le reste ». Tranche le travail transverse laissé ouvert par l'ADR-018.

### Contexte

L'étape 7 remplace l'agenda externe. `EssaiRdv` n'est pas un créneau : c'est la trace, à la journée et avec compte rendu, d'un rendez-vous tenu pendant l'essai. Il fallait un modèle de créneaux, sans double réservation possible, y compris pour un praticien qui tourne sur plusieurs centres, dans un fuseau qui change d'heure deux fois par an.

### Décision

- **Ressources** : pas de table commune. `Praticien` existe, `Cabine` s'ajoute. Un RDV porte `praticienId?` et `cabineId?` : au plus un de chaque. Un praticien n'a qu'un planning, quels que soient ses centres.
- **Double réservation** : deux contraintes `EXCLUDE USING gist` sur `rendez_vous`, avec `btree_gist`, bornes `[)`, hors `ANNULE` et `ABSENT`. `detecterConflits` donne le message ; la base reste le dernier rempart, car deux réservations simultanées ne se voient pas avant le `COMMIT`. Elles remontent en `P2039`, ou `P2034` si elles s'interbloquent, et se lisent dans `originalCode`.
- **Conflits** : `PRATICIEN_PRIS` et `CABINE_PRISE` ne se forcent jamais. `HORS_DISPONIBILITES` et `CENTRE_FERME` se confirment en interne et le journal le note. Une origine `EN_LIGNE` ne confirme jamais.
- **Disponibilités** : horaires hebdomadaires dans `PraticienCentre.horaires`, au format de `Centre.horairesOuverture`. Une cabine suit l'ouverture du centre. `ExceptionAgenda` ajoute ou retire, sans texte libre : un motif comme un arrêt maladie serait une donnée de santé en clair. Une disponibilité exceptionnelle ouvre aussi les cabines du centre.
- **Dates** : `timestamptz`, une première dans ce schéma, requise par `tstzrange`. Le domaine compte en millisecondes, sans `new Date`, et `commun/fuseau.ts` passe par `Intl`.
- **Changement d'heure** : une heure inexistante est refusée à la saisie et ramenée au premier instant valide dans une plage. Une heure ambiguë prend sa première occurrence à la saisie ; une plage s'élargit aux deux. Les créneaux avancent de 15 minutes en temps réel depuis minuit : les décalages de Paris étant en heures pleines, ils restent alignés sur l'heure locale. Un RDV de la seconde occurrence garde son instant tant que son heure locale ne bouge pas.
- **Statuts** : ceux de l'énoncé, sans `EN_COURS`. La salle d'attente lit `priseEnChargeLe`.
- **Concurrence** : toute écriture sur un RDV est conditionnée à `version`, qu'elle incrémente. Un glisser ne peut pas écraser une arrivée.
- **Prospect** : colonnes du RDV, effacées à la conversion. L'identité obligatoire d'une fiche se demande à l'arrivée, et les doublons s'y contrôlent. Le patient et le RDV s'écrivent dans une transaction ; un CHECK interdit `ARRIVE` et `VU` sans patient.
- **Périmètre** (précise l'ADR-002) : la recherche de patient reste bornée aux centres de l'utilisateur. Un RDV sur son centre lui montre pourtant le nom et le téléphone d'un patient rattaché ailleurs, sans lien vers la fiche : l'agenda ne fonctionne pas autrement.
- **Audit** : la grille et la salle d'attente sont des listes, sans READ (ADR-006), et ne chargent ni notes ni dossier. Ouvrir un RDV écrit un READ. Les notes sont chiffrées et absentes du journal.
- **Événements** : outbox `evenement_domaine`, écrite dans la transaction du métier, sans nom ni libellé de type, car « Fin d'essai » est déjà une donnée de santé. `diffuser-evenements` la diffuse aux abonnés, en au moins une fois, avec l'identifiant de l'événement comme clé d'idempotence.
- **Travail transverse** : une tâche planifiée sans organisation ne fait qu'une chose, mettre en file des travaux par organisation. `ha_plateforme` n'a droit qu'à `organisation_id` et `diffuse_le` de l'outbox, jamais à `charge`.
- **Grille** : composant maison à pointeurs, sans dépendance. FullCalendar réserve les vues par ressource à sa licence payante. Le panneau du RDV offre un formulaire de déplacement pour le clavier.
- **Lien avec l'essai** : seulement préparé, par `dossierId` et `TypeRdv.natureEssai`. Aucun `EssaiRdv` n'est écrit : la trace exige un compte rendu, et un RDV planifié n'est pas un RDV tenu.

### Conséquences

- `btree_gist` doit exister chez l'hébergeur HDS : à vérifier à l'étape 23.
- Un RDV n'a qu'un praticien et une cabine : deux praticiens sur un même RDV demanderaient une table de liaison.
- Un utilisateur du seul centre B ne peut pas réserver pour un patient du seul centre A : à arbitrer. Il créerait sinon un doublon.
- Seuls les AUDIO ont une fiche praticien : un dépistage fait par un assistant n'occupe qu'une cabine, sans trace de qui reçoit.
- Les types par défaut existent en deux endroits : `TYPES_RDV_DEFAUT` et la migration, figée à sa date.
- Le worker exige désormais `DATABASE_URL_PLATEFORME`.
- Un prospect jamais converti reste en base, et `evenement_domaine` grossit sans purge : à traiter à l'étape 22.
- Un praticien ne peut pas être retiré d'un centre où il a des RDV à venir. Sa désactivation ne le vérifie pas encore.

## ADR-021 – Prise de rendez-vous en ligne

- **Date** : 2026-10-31
- **Statut** : acceptée. Complète l'ADR-020. Ajoute le port `Captcha`, absent de la liste de CLAUDE.md. Admet une tâche transverse qui écrit, en exception à l'ADR-020.

### Contexte

L'étape 8 ouvre l'agenda à des visiteurs sans compte. Tout y supposait un utilisateur connecté : services, `withAudit`, `created_by_id`. Aucune route n'était publique, et un anonyme peut désormais créer une charge, envoyer des SMS payants et tenir des créneaux.

### Décision

- **URL** : `/rdv/<client>/<centre>`, par slugs générés depuis le nom. Le slug d'un client est fixé à sa création, celui d'un centre se règle dans ses paramètres. `lien` est réservé.
- **Sans contexte, une seule étape** : `ha_plateforme` résout les slugs (`GRANT SELECT (slug)`), puis tout passe sous RLS par `base`/`enTransaction({ organisationId })`. Client suspendu, centre fermé, réservation inactive ou absence de fournisseur de SMS répondent tous 404.
- **Verrou** : une table `reservation_en_ligne`, pas une ligne de `rendez_vous`. Aucun nouveau statut, et les CHECK de l'agenda restent vrais. Deux contraintes d'exclusion `WHERE statut = 'VERROU'` départagent les patients. Un prédicat d'exclusion ne lit pas l'heure : un verrou expiré se supprime dans une instruction séparée, juste avant l'insertion, et le rendez-vous est relu juste après.
- **Un verrou ne bloque pas l'accueil** : `VERROU_EN_LIGNE` se confirme en interne et se trace, comme un créneau hors disponibilités. Sinon quelques visiteurs anonymes gèleraient l'agenda. Conséquence acceptée : l'accueil qui passe outre fait perdre le créneau au patient, jamais de double rendez-vous, l'exclusion de `rendez_vous` tranchant à la finalisation.
- **Fenêtre** : le délai le plus long du centre et du type s'applique. À la finalisation, il se juge à l'instant du verrou : saisir son code ne fait pas perdre sa place. Horaires, congés et ressources sont, eux, rejugés.
- **« À valider »** : `EN_LIGNE` + `PLANIFIE` + réservation liée, sans nouveau statut. Un déplacement par le patient y revient en validation manuelle.
- **Rapprochement** : après le code SMS seulement, à l'échelle du client, par téléphone, nom et date de naissance. Le prénom départage des jumeaux ; le doute reste un prospect. La réponse est identique dans tous les cas, pour ne pas révéler qu'une personne est patiente. L'e-mail saisi, non vérifié, ne s'écrit jamais sur une fiche existante. Le consentement SMS coché s'y reporte, avec une ligne d'audit.
- **Minimisation** : le motif passe chiffré dans `rendez_vous.notes`. L'identité s'efface au rapprochement, ou à la conversion du prospect. Le contact sert aux messages, puis s'efface après le rendez-vous.
- **Jeton de parcours** : aléatoire, stocké en empreinte, dans l'état du formulaire et jamais dans l'URL, où les journaux d'accès le garderaient.
- **Lien du patient** : `/rdv/lien/<organisationId>.<reservationId>.<hmac>`, recalculable par le travail d'envoi, donc sans stockage, avec une clé dédiée `LIEN_RDV_CLE`. La signature se vérifie avant tout `base()`. Il ne dépend ni des slugs ni de `actif` : un patient garde l'annulation si le centre ferme la réservation. La page ne dit ni le nom ni le type, et n'agit qu'en POST : un scanner de liens n'annule rien.
- **Messages** : table `notification`, écrite dans la transaction du métier, envoyée par `packages/jobs` (cron à la minute, reprise, abandon après 5 essais). Au moins une fois : un message peut très rarement partir deux fois. Seul le code SMS part directement du web et n'est jamais stocké. Les gabarits n'acceptent que centre, date, heure et téléphone du centre.
- **Captcha** : ALTCHA auto-hébergé, preuve de travail sans tiers ni cookie, résolue sans case à cocher au choix du créneau. Une réponse ne se rejoue pas.
- **Limitation** : compteurs avant toute lecture. Le téléphone y figure en empreinte de sa forme canonique.
- **Widget** : une iframe, seule à accepter `frame-ancestors *`, sans liste de domaines par client. Le logiciel et le lien du patient refusent tout cadre, ce qui n'existait pas avant cette étape.
- **Purge de `limitation_debit`** : tâche transverse qui écrit, en exception à l'ADR-020. La table est technique, sans organisation.

### Conséquences

- La réservation n'ouvre pas en production : aucun fournisseur de SMS ni d'e-mail n'est retenu, `docs/vendor` n'en documente aucun. Le worker démarre sans les envois, et la page répond 404.
- La confirmation par SMS et e-mail part sous une minute environ, et non à l'instant : l'écran, lui, confirme aussitôt.
- Un widget sur un site encore en HTTP n'a pas WebCrypto, même servi en HTTPS : il renvoie vers la page complète.
- `adresseClient` dépend de `PROXIES_DE_CONFIANCE` (ADR-019) : sans proxy, la limitation publique se contourne. Bloquant avant ouverture (étape 23).
- `journal_audit` note « Réservation en ligne » comme auteur, sans personne ni adresse IP.
- Un message envoyé par un travail n'écrit pas de ligne `SEND` : la table `notification` en tient lieu 30 jours (ADR-019).
- Un déplacement par l'accueil ne prévient que les patients venus en ligne : les autres attendent l'étape 19.

## ADR-022 – Dossier audiologique

- **Date** : 2026-10-31
- **Statut** : acceptée. Applique la Rec BIAP 02/2. Le port `NoahConnector` reste à créer à l'étape 24.

### Contexte

L'étape 9 ouvre les premières données cliniques du logiciel : anamnèse, otoscopie, audiométrie, questionnaires. L'intégration NOAH viendra plus tard et sa documentation n'est pas déposée, mais chaque mesure doit déjà garder sa source. La classification de surdité n'était dans aucun document de `docs/ref`, et le BIAP a remplacé sa recommandation le 1er septembre 2026.

### Décision

- **Classification** : BIAP Rec 02/2 seule, grades 0 à 6 par oreille. La 02/1 bis, retirée, n'est pas codée. L'écran dit « grade audiométrique », pas « classe de surdité », comme le demande le texte.
- **Portée du grade** : indicateur descriptif, sans lien avec `audio-rules`. Le texte l'exclut de l'éligibilité et du choix d'un appareil.
- **Aucune estimation** : une fréquence manquante rend la moyenne non calculable, une réponse manquante rend un score incomplet. Pas d'arrondi avant le classement.
- **Bilan** : la séance. Sans lien obligatoire vers `Dossier`, car il précède le dossier d'appareillage. Sans statut « validé » : une mesure se corrige, le journal garde la trace sans valeur de santé.
- **L'accès suit le patient** : le droit se juge sur le centre actuel du patient, pas sur celui du bilan. Sinon un patient qui change de centre perdrait son historique pour sa nouvelle équipe. `centre_id` dit où le bilan a eu lieu. Une fusion de patients déplace les bilans.
- **Données cliniques** : un JSON chiffré par colonne (`donnees`, `constat`, `reponses`), relu avec Zod et `versionSchema`. Elles ne sont ni filtrables ni agrégeables en SQL, et ne sont jamais écrites dans le journal.
- **PTA, grades et scores ne se stockent pas** : ils se recalculent à la lecture, comme `evaluerFactures`. Une évolution de la règle s'applique donc à l'historique.
- **Prêt pour NOAH** : `source`, `identifiant_externe` (exigé si et seulement si `NOAH`, contrainte CHECK), unicité partielle pour un import idempotent, `importe_le`. Une mesure importée se lit et ne se modifie pas. Aucun champ propre à NOAH n'est inventé.
- **Formulaires paramétrables** : `modele_formulaire` versionné, immuable par les droits (`ha_app` n'a `UPDATE` que sur `actif`, ni `DELETE`). Une réponse reste liée à sa version. Un même modèle sert à l'anamnèse et aux questionnaires. Les modèles livrés se copient au premier bilan, jamais à la lecture.
- **Gestion des modèles** : `ADMIN_CLIENT` seul, car un modèle est commun à tout le client.
- **Droits** : l'assistante lit tout le bilan et saisit l'anamnèse et les questionnaires. Otoscopie et audiométrie suivent `peutActerAppareillage`.
- **Graphiques** : SVG pur écrit par le domaine, sans dépendance. Le même rendu sert à l'écran, au PDF (Chromium sans JS ni réseau) et aux instantanés. L'audiogramme garde 1 octave = 20 dB.
- **Saisie rapide** : la conversion de la grille est dans le domaine. Une cellule illisible bloque l'envoi au lieu d'être convertie : `NaN` deviendrait `null` en JSON, soit « pas de réponse », compté 120 dB.
- **Synthèse PDF** : rendue à la demande et jamais stockée, avec une ligne `PRINT` à chaque téléchargement, comme le compte rendu d'essai.

### Conséquences

- La Rec 02/2 est une recommandation professionnelle, en anglais : les intitulés français sont une traduction à confirmer (R24).
- Les habitués des catégories « légère, moyenne, sévère, profonde » verront des grades dont les bornes diffèrent.
- La relecture passe par `audiogrammeSaisieSchema`, qui impose le pas de 5 dB. L'étape 24 devra l'assouplir pour les mesures importées, qui peuvent avoir un autre pas.
- Le schéma de relecture des mesures est aussi celui de la saisie : une évolution devra passer par `versionSchema`.
- Une photo remplacée s'efface du stockage ; une photo déposée reste attachée au constat tant qu'on ne la remplace pas. Aucun écran ne la retire seule.
- Aucun questionnaire validé n'est livré (R26) : chaque client saisit les siens, sous sa responsabilité sur les droits d'usage.
- Le parcours E2E de l'éditeur de modèles est dans `admin-2fa.spec.ts`, seule spec qui tient une session ADMIN_CLIENT ouverte.
- `lireFiche` fait encore un `Promise.all` dans une transaction, ce qui déclenche un avertissement de dépréciation de `pg`. Antérieur à cette étape, non traité ici.

## ADR-023 – Stock : réception réutilisable, inventaire et valeur

- **Date** : 2026-11-01
- **Statut** : acceptée. Complète l'ADR-010.

### Contexte

La mise à niveau de l'étape 10 demande des mouvements liables à une commande, une réception réutilisable par l'étape 17, un inventaire par centre avec des écarts justifiés et la valeur du stock. Le statut `PRET` existait déjà (appareil prêté, ADR-010) ; il n'avait pas de test d'intégration.

### Décision

- **Commande** : `commande_id` nullable sur `mouvement_appareil` et `mouvement_accessoire`, indexé, sans clé étrangère. La table n'existe qu'à l'étape 17, qui posera la FK et son trigger `verifier_meme_organisation`. Créer une table vide maintenant aurait figé son modèle avant son étape.
- **Réception** : `receptionnerDansTransaction(tx, acteur, entree)` dans `services/reception.ts`. Elle prend des données déjà interprétées (centimes), plusieurs modèles et des accessoires, et rend les événements d'audit à journaliser par l'appelant : l'étape 17 l'appellera dans sa propre transaction. `receptionner` l'enveloppe, `recevoirAppareils` reste l'adaptateur du formulaire.
- **Droit sur le prix** : contrôlé au formulaire seulement. Un prix de commande n'est pas une saisie de l'utilisateur : un assistant qui réceptionne une commande chiffrée reste légitime.
- **Inventaire** : `Inventaire` et `InventaireLigne`, un seul ouvert par centre (index partiel), figés à la clôture par triggers.
- **Appareils attendus** : `EN_STOCK` et `RESERVE`. Ils sont recalculés à la lecture et à la clôture, sans liste figée à l'ouverture : un appareil vendu pendant l'inventaire n'est pas un manquant. Un appareil en essai, prêté ou au SAV n'est pas sur l'étagère.
- **Accessoires** : la quantité théorique est relevée au comptage, et la clôture applique l'écart relevé à la quantité du moment. Une vente postérieure au comptage reste comptée une seule fois.
- **Clôture** : tout accessoire en stock doit être compté et tout écart justifié, en texte chiffré. Les accessoires sont corrigés par `INVENTAIRE_ENTREE` et `INVENTAIRE_SORTIE`, la justification servant de motif. Un appareil manquant ne change pas de statut : aucun statut ne dit « perdu », en créer un dépasse cette étape. L'écart reste consigné dans la ligne.
- **Droits** : ouvrir, justifier et clôturer sont réservés aux rôles de gestion ; le pointage et le comptage sont ouverts à tous dans leurs centres.
- **Valeur** : au prix d'achat. Comptent `EN_STOCK`, `RESERVE`, `EN_ESSAI`, `PRET` et `SAV`, propriété du client ; ne comptent ni la consignation, propriété du fabricant, ni `VENDU`, ni `RETOUR_FABRICANT`. Un article sans prix est compté à part, jamais à zéro. La clôture photographie la valeur. Choix de gestion, sans texte de référence.
- **`Accessoire.prixAchatCentimes`** : ajouté, nullable, réservé aux rôles de gestion. Absent de `AccessoireResume`, qui part vers des écrans ouverts à tous.

### Conséquences

- L'étape 17 doit poser les clés étrangères de `commande_id`, avec leur trigger.
- Deux fabricants peuvent partager un numéro de série : un pointage vaut alors pour les deux appareils du centre.
- Un appareil réellement perdu reste `EN_STOCK` : il ressortira manquant à chaque inventaire jusqu'à ce qu'un statut de sortie existe.
- La valeur n'est une valeur d'inventaire comptable que si les prix sont saisis : le seed les renseigne, sauf pour les appareils en consignation.

## ADR-024 – Dossier : ordre des statuts, bilan de référence et origine

- **Date** : 2026-11-01
- **Statut** : acceptée. Complète l'ADR-011, confirme les ADR-012 et ADR-013.

### Contexte

La mise à niveau de l'étape 11 demandait l'ordre `DEVIS_EMIS → DEVIS_SIGNE → EN_ESSAI → A_FACTURER`, avec migration des dossiers, un lien vers le bilan de référence, la création d'un dossier depuis un RDV ou un bilan, et le forçage réservé à ADMIN_CLIENT.

### Décision

- **Ordre maintenu** (arbitré le 2026-11-01) : `DEVIS_EMIS → EN_ESSAI → DEVIS_SIGNE → A_FACTURER`. Le modèle de devis l'impose : le devis n'engage pas « jusqu'à la signature du point 5 » (p. 1) et la signature vient « à l'issue de la période d'essai » (p. 2 § 5). Inverser reviendrait à faire signer l'engagement avant l'essai. Les 9 statuts existaient déjà : aucune migration de dossiers n'est nécessaire, et l'ordre de l'enum Prisma, sans effet, reste celui demandé.
- **Bilan de référence** : `Dossier.bilanReferenceId` nullable, modifiable tant que `prescriptionModifiable`. Contrôle de service plutôt qu'une clé composite : la fusion de patients déplace dossiers et bilans par deux écritures, qu'une clé composite ferait échouer. Aucune reprise sur les dossiers existants : choisir un bilan est un acte clinique.
- **Accès au bilan** : la fiche dossier n'expose que les dates des bilans. Le contenu reste à l'écran du bilan, soumis à ses droits (ADR-022).
- **Origine** : `creerDossier` accepte `rdvId` ou `bilanId`, portés par le formulaire. Le RDV reçoit `dossierId` dans la transaction de création, version vérifiée. Un RDV de prospect n'ouvre pas de dossier : le patient doit exister (contrainte `rendez_vous_dossier_avec_patient`).
- **Rattachement** : `rattacherRdvDossier` relie un RDV sans dossier à un dossier du même patient. Il ne change pas un rattachement existant.
- **Forçage** : déjà conforme, seule la prescription se force et seul ADMIN_CLIENT le peut (ADR-011). Devis et signature restent sans forçage, car leurs erreurs sont des minimums du texte (ADR-013). Test ajouté pour `RESPONSABLE_CENTRE`.

### Conséquences

- La frise garde l'ordre de `STATUTS_DOSSIER`, différent de celui de l'enum Prisma. Aucun tri SQL ne repose sur cet enum.
- Un dossier n'exige pas de bilan de référence : aucun texte de `docs/ref` ne l'impose.

## ADR-025 – Devis : signature à l'écran, preuve archivée et part AMC issue de la PEC

- **Date** : 2026-11-01
- **Statut** : acceptée. Complète l'ADR-012 et l'ADR-014.

### Contexte

La mise à niveau de l'étape 12 demande un port `ESignature` avec `FakeESignature` (signature à l'écran sur tablette), l'archivage du devis signé et de sa preuve, le scan en alternative, et une part AMC égale au montant de la PEC quand elle existe. Aucun fournisseur de signature n'est documenté dans `docs/vendor`. La PEC ne se saisissait qu'en `A_FACTURER`, jamais avant le devis.

### Décision

- **Port** : `ESignature.signer` prend l'empreinte du document, le tracé et l'horodatage, et rend une preuve sans donnée patient. `FakeESignature` n'a aucune valeur probante. Hors production, `E_SIGNATURE=simulation` ouvre l'écran ; en production, l'écran reste fermé et seul le scan fonctionne.
- **Contrôles** : `verifierSignable` est commun aux deux modes, rejoué dans la transaction. Mêmes rôles, mêmes blocages de fin d'essai, même refus d'un devis échu. La date de signature à l'écran est le jour même.
- **PDF signé** : le PDF émis reste intact et son SHA-256 entre dans la preuve. Une feuille de signature (§ 5 : offre retenue, « bon pour accord », date, tracé) est assemblée à sa suite par `pdf-lib`, dans l'adaptateur. La vue du PDF n'est pas conservée, car elle porte le NIR : un nouveau rendu pourrait différer du document remis. Le devis signé compte donc une page de plus que le modèle.
- **Archivage** : le PDF signé va dans `scanCle`, avec `mode: 'ELECTRONIQUE'`. Le JSON de preuve va dans le `DocumentStore` (`devis-preuves/`), et `preuve` le référence. Aucune migration de structure, comme l'annonçait l'ADR-012. Un scan déposé auparavant est remplacé.
- **PEC avant l'achat** : `enregistrerPec` s'ouvre dès `PRESCRIPTION_OK` (`dossierAcceptePec`), comme le permettait l'ADR-014. Le formulaire apparaît sur le dossier. Le journal note l'entité `DOSSIER` tant qu'il n'y a pas de facture préparée.
- **Part AMC** : une PEC `ACCORDEE`, hors C2S comme à la facture, remplace la saisie du brouillon. `amcDepuisPec` la répartit entre les postes de chaque offre par `repartirAmc`, plafonnée au reste. Les champs passent en lecture seule. Chaque offre reçoit le montant entier : la PEC est unique par dossier, sans lien avec une offre.
- **Émission** : les parts issues de la PEC sont écrites sur les offres, puis figées. Un verrou sur la ligne du devis précède cette écriture : le perdant d'une émission concurrente échoue sur un conflit, pas sur le trigger de gel.
- **PEC après l'émission** : le devis reste figé. `pecDifferente` affiche une alerte qui propose une nouvelle version, sans l'imposer : après la signature, elle rouvrirait l'essai (ADR-012), et la facture lit la PEC de toute façon.

### Conséquences

- Tant qu'aucun fournisseur n'est retenu, la production ne connaît que le scan. Le port reste à confronter à sa documentation.
- La feuille porte le nom de l'audioprothésiste, pas sa signature, alors que le modèle l'attend au § 5 (À VÉRIFIER).
- La valeur probante d'une signature sur tablette n'est pas établie (À VÉRIFIER).
- La règle de répartition reste celle de R23, À VÉRIFIER : aucun document ne décrit une PEC.
- Une PEC accordée pour une seule des deux offres s'applique aussi à l'autre.

## ADR-026 – Lien sécurisé vers un document

- **Date** : 2026-11-01
- **Statut** : acceptée. Complète l'ADR-021.

### Contexte

Le devis doit partir au patient et le compte rendu au prescripteur par un lien sécurisé. `CLAUDE.md` impose une durée limitée et interdit la pièce jointe. Le lien de l'étape 8 n'expire pas, et il repose sur le principe qu'un lien transféré ne dévoile rien : il ne convient pas à un document qui porte le NIR ou des données de santé. `Notification` exigeait une réservation.

### Décision

- **Second facteur** (arbitré le 2026-11-01) : la date de naissance du patient, pour le patient comme pour le prescripteur. Elle ne dépend d'aucun fournisseur de SMS. Cinq erreurs ferment le lien.
- **`LienDocument`** : cible, destinataire, clé du PDF, expiration à 7 jours, révocation, tentatives, ouvertures. Le jeton n'est pas stocké.
- **Jeton** : `SignatureLienDocument`, HMAC calculé sur l'organisation et l'identifiant du lien. Même clé que `LIEN_RDV_CLE`, contexte distinct : aucune variable à ajouter, et un jeton de RDV ne vaut pas pour un document. Une rotation touche les deux types de liens.
- **Refus** : expiré, révoqué, bloqué, falsifié et client suspendu donnent le même message.
- **Tentatives** : le refus se lève après la transaction, sinon elle annulerait le décompte.
- **Message** : `DOCUMENT_A_CONSULTER`, schéma strict réduit au nom du centre. Ni nature du document ni patient. Un message a une source et une seule (CHECK). L'organisation d'une notification s'hérite désormais de sa source.
- **Envoi** : le devis en vigueur, signé s'il l'est, au canal choisi, sous réserve de la coordonnée et du consentement. Le compte rendu, figé en PDF à l'envoi (ADR-013 le rendait à la demande), va à l'adresse du prescripteur de la dernière ordonnance. E-mail seulement : MSSanté attend la documentation d'un fournisseur.
- **Sans fournisseur** : l'envoi est refusé, pour ne pas annoncer un message qui ne partirait jamais.
- **Journal** : ligne `SEND`, première utilisation de cette action, et `READ` à l'ouverture, avec l'auteur « Lien sécurisé ».
- **Purge** : `purger-liens-document` retire chaque nuit le compte rendu figé d'un lien expiré. Le PDF d'un devis reste, c'est le document du dossier. Le travail ne tourne que si le stockage S3 est configuré.

### Conséquences

- Une date de naissance se connaît ou se devine : protection modeste, à réexaminer à l'étape 22 (À VÉRIFIER).
- Le prescripteur doit connaître la date de naissance de son patient, ce qui suppose qu'il ait le dossier sous la main.
- La base légale de ces envois est absente de `docs/ref` (À VÉRIFIER) : le consentement est appliqué par prudence.
- Un compte rendu envoyé puis modifié par un nouveau rendez-vous reste celui de l'envoi : il faut renvoyer un lien.
- Tant qu'aucun fournisseur de SMS et d'e-mail n'est retenu, rien ne part en production.

## ADR-027 – Les rendez-vous d'essai sont des rendez-vous de l'agenda

- **Date** : 2026-11-01
- **Statut** : acceptée. Remplace le point « Rendez-vous » de l'ADR-013. Complète l'ADR-020.

### Contexte

L'ADR-013 traçait les rendez-vous d'essai sans agenda, Doctolib le restant. L'agenda existe depuis l'étape 7, et `RendezVous` porte déjà `dossierId`, `TypeRdv.natureEssai` déjà la nature. L'alimentation d'`EssaiRdv` promise à l'étape 13 n'avait pas été faite.

### Décision

- **Modèle** : le créneau est un `RendezVous`. `EssaiRdv` reste, comme compte rendu en ajout seul d'un rendez-vous tenu, avec `rendezVousId` obligatoire et unique. L'ADR-020 reste vraie : un RDV planifié n'est pas un RDV tenu. Le compte rendu reste obligatoire et chiffré dans son contexte, sans rechiffrement.
- **Règles** : `etatEssai` et `blocagesSignature` ne changent pas. Les 2 rendez-vous de la signature se comptent sur les comptes rendus saisis.
- **Parcours** : `planifierRdvEssai` crée le RDV pour le patient et le praticien du dossier. Marqué `VU` dans l'agenda, il attend son compte rendu (`enregistrerCompteRendu`), signalé sur le panneau du RDV et sur l'essai.
- **Agenda** : `creerRdv` exige un dossier pour un type d'essai quand il y a un patient. Un RDV qui a son compte rendu ne se déplace, ne s'annule ni ne change de statut, y compris par le lien du patient : le contrôle est dans `appliquerDeplacement` et `appliquerAnnulation`.
- **Migration** : chaque `EssaiRdv` reprend un RDV `VU` du dossier, de même nature et du même jour, s'il existe. Sinon un RDV est créé : statut `VU`, origine `INTERNE`, praticien du dossier, type de même nature ou type inactif « (reprise) ».
- **Heure reprise** : l'ancienne trace n'avait qu'une date. L'heure est le premier créneau libre du praticien à partir de 9 h, par pas de 30 minutes, pour respecter l'exclusion. **Cette heure est conventionnelle, donc fausse.** Elle n'apparaît que dans l'agenda passé et reste sans effet sur le décompte.

### Conséquences

- Le praticien d'un RDV repris est le titulaire du dossier, pas forcément celui qui a reçu le patient.
- Sans type d'essai actif, le bloc Essai renvoie au paramétrage : les types par défaut en fournissent trois.
- Une cabine étant requise par ces types, un centre sans cabine doit les paramétrer.
- Un RDV saisi par erreur, puis complété d'un compte rendu, reste définitif (déjà noté dans l'ADR-013).

---

## ADR-028 – Facturation : Facture issue de FacturePreparee, avoirs, chaîne et préparation de la FSE

- **Date** : 2026-11-01
- **Statut** : acceptée. Complète l'ADR-014 et l'ADR-015 ; remplace dans l'ADR-014 l'interdiction de numéroter et la date de délivrance saisie, et dans R18 les constantes de TVA.

### Contexte

`FacturePreparee` ne portait ni numéro ni ligne : elle attendait un export Cosium abandonné. L'étape 14 en fait la facture réelle, sans second modèle. Aucun service n'écrivait `Delivrance`, donc le délai de 4 ans ne voyait aucune vente. `docs/vendor/areafse` est vide et le texte sur les logiciels de caisse n'est pas dans docs/ref.

### Décision

- **Une table** : `facture_preparee` est renommée `facture`, et les lignes existantes sont reprises : brouillon si le dossier est `A_FACTURER`, `ABANDONNEE` sans numéro sinon. Facture et avoir partagent table, lignes, série, chaîne et PDF (`nature`, `facture_origine_id`). `dossier_id` devient nullable pour la vente directe ; un index partiel garde un seul brouillon par dossier.
- **Lignes** : les lignes issues du devis restent calculées à la lecture (motif de l'ADR-014) ; les lignes saisies sont stockées dès le brouillon. Toutes se figent à la validation, qui relit et recontrôle dans sa transaction.
- **Date** : date de facture = date de délivrance = jour de validation, non antidatable (décision du 2026-11-01). La saisie disparaît, et un brouillon se calcule au jour courant.
- **Numérotation** : ligne `serie_facture` verrouillée par `INSERT … ON CONFLICT DO UPDATE`, ce qui couvre le premier numéro. Le rollback rend le numéro. L'attribution de la date sous ce verrou garde la série chronologique.
- **Chaîne** : une par centre, dans `evenement_caisse`, journal et chaîne à la fois. L'étape 15 y ajoutera ses types. `verifierChaineCaisse` recalcule aussi chaque pièce depuis ses lignes, pour détecter une ligne modifiée à journal intact, et compare la tête pour détecter un dernier maillon retiré. Le hachage passe par le port `Hacheur`, `node:*` étant interdit au domaine.
- **Ordre des verrous** : série, puis tête de chaîne, puis lignes métier.
- **Gel** : triggers `facture_figee`, `ligne_facture_figee`, `evenement_caisse_ajout_seul`, et `DELETE` retiré à `ha_app` sur `facture`. Seul `pdf_cle` se pose après la validation, une fois.
- **PDF** : rendu après le commit, le numéro n'existant qu'à ce moment. Un échec ne remet pas la facture en cause : le prochain téléchargement rend à nouveau depuis le contenu figé. La première sortie est l'original, toute autre un duplicata marqué, journalisé et chaîné. Un duplicata envoyé par lien est déposé sous `liens-documents/` et purgé à l'expiration.
- **TVA** : table globale `taux_tva`, lue aussi par le devis ; `viderBaseJetable` la conserve, car la migration la remplit.
- **Vente** : à la validation, `Delivrance` par oreille, appareils `RESERVE → VENDU`, lien d'essai fermé, sortie de stock, dossier `FACTURE`. `VENDU` n'est plus accessible par la fiche, et `annulerVente` refuse un appareil facturé.
- **Avoir** : une action, sans brouillon. Le cumul se lit sous le verrou de la série. S'il solde une facture de dossier, la vente est annulée (R29).
- **Lien sécurisé** : `lien_document` porte `patient_id`, second facteur compris, et `facture_id` : une vente directe n'a pas de dossier.
- **FSE** : action explicite, port provisoire, contenu chiffré. Le dépôt se fait hors transaction ; une FSE sans référence peut repartir.
- **LPP dans la transaction** : `decrireCodesLpp` accepte le client de la transaction. Sinon chaque validation demanderait une seconde connexion au même pool, et dix validations simultanées se bloqueraient.
- **Journal d'audit** : `FACTURE_PREPAREE` reste dans `TYPES_ENTITE`, le journal ne se réécrivant pas ; les nouvelles lignes portent `FACTURE`.
- **Droits** : valider comme confirmer l'achat ; avoir comme annuler une vente ; préfixe pour l'ADMIN_CLIENT ; TVA pour le SUPERADMIN.

### Conséquences

- Un centre sans stock suffisant de piles ou d'accessoires ne peut pas valider : la facture attend une entrée de stock.
- Un stock d'accessoires n'est pas recrédité par un avoir (à arbitrer).
- La confirmation de couverture se refait après un avoir total : elle portait sur la facture annulée.
- Un avoir sur une FSE déjà partie n'est qu'une alerte jusqu'à l'étape 26.
- Le seed construit sa vente directe et son avoir par les règles du domaine, sans PDF : leur téléchargement les rend à la demande.
- Une facture de dossier ne peut pas être abandonnée : seul un avoir la défait, une fois validée.

---

## ADR-029 – Encaissement et caisse : chaîne signée, clôtures, archives et export

- **Date** : 2026-11-01
- **Statut** : acceptée. Complète l'ADR-028 ; lève l'interdiction des champs de règlement posée par l'ADR-014.

### Contexte

L'objectif est de remettre une attestation individuelle d'éditeur à chaque client. Rien ne traitait l'argent : ni encaissement, ni clôture, ni archive. La chaîne de l'étape 14 ne hachait ni l'horodatage ni l'acteur, et un SHA-256 sans clé se recalcule entièrement avec les droits de propriétaire sur la base, ce qui vise aussi l'éditeur d'un SaaS. L'attestation engage son représentant légal (BOFiP § 300).

### Décision

- **Sources** : BOFiP enregistré dans `docs/ref/fiscal`. Légifrance refuse le téléchargement : l'art. 286 du CGI et l'art. A47 A-1 du LPF restent À VÉRIFIER.
- **Une chaîne par centre, conservée** : « sa série » désigne la chaîne du centre, toutes natures mêlées. Le texte n'impose pas de technique (§ 60, § 140).
- **Format 2 du maillon** : `horodatage`, `acteurId` et `centreId` entrent dans l'empreinte, et le format lui-même. Les maillons de l'étape 14 restent vérifiés en format 1, sans réécriture. L'horodatage vient du port `Clock`, sous le verrou de tête, et ne recule pas : une clôture peut découper la chaîne par instants.
- **Signature Ed25519** des clôtures et des archives, sur l'empreinte du maillon. Clé privée hors de la base, en environnement jusqu'à l'étape 23 ; clé publique dans la notice : la vérification se fait sans secret. Elle s'ajoute au SHA-256 demandé.
- **Encaissement** : table en ajout seul. Remboursement et annulation sont des lignes inverses. Le solde est calculé, jamais stocké, car `facture_figee` compare toute la ligne. Il se lit au dossier : acomptes et paiements suivent la facture suivante après un avoir total.
- **Acomptes** : `facture.acomptes_deduits_centimes`, figé à la validation pour le PDF et l'écriture. Il n'entre dans la charge que s'il est non nul : les anciens maillons restent identiques.
- **Plafond** : TTC net d'avoirs, faute de drapeau de tiers payant avant l'étape 16.
- **Caisse physique et clôture fiscale séparées** : `session_caisse` et `comptage_caisse` pour le tiroir, un comptage pouvant être refait. La clôture fiscale est automatique, car impérative, et ne porte jamais sur la journée en cours. Une opération est horodatée à sa saisie : une journée passée ne reçoit plus rien, sans blocage au guichet.
- **Clôture** : plage de rangs, donc rien n'est compté deux fois. Le mois additionne ses jours, l'exercice ses mois. Le total perpétuel est un cumul de chiffre d'affaires (§ 170) ; le cumul des encaissements s'y ajoute. Colonnes en `BigInt` : un `Int` plafonne à 21 M€.
- **Paquet `@ha/caisse`** : `@ha/jobs` ne peut pas importer `apps/web`. Le cœur (maillon, clôture, archive, vérification) y vit ; le travail reste dans `packages/jobs`. Un seul travail, `caisse-nuit`, fixe l'ordre : vérifier, clôturer, archiver.
- **Acteur système** : `evenement_caisse.acteur_id` devient nullable, seulement pour clôture, archivage et échec de vérification (CHECK).
- **Archive** : un JSON par mois clôturé, notice comprise. L'empreinte porte sur le texte en clair, car `DocumentStoreChiffre` utilise un IV aléatoire. Le fichier est écrit avant la transaction : un échec laisse au pire un orphelin, jamais une ligne sans fichier. Pas de purge.
- **Textes libres** : chiffrés au repos, le maillon n'en garde que l'empreinte. La vérification doit donc déchiffrer.
- **Déchiffrement** : l'extension ne descend pas dans un `include` : comptages et motifs se lisent par une requête directe.
- **Écritures comptables** : déduites des maillons, donc de ce qui est chaîné. Comptes de tiers collectifs, sans identité de patient. Le FEC couvre ventes et encaissements, par SIREN et par exercice.
- **Droits** : tous les rôles encaissent, ouvrent et comptent ; rembourser, clôturer, archiver et exporter reviennent aux gestionnaires du centre.
- **Protection renforcée** : `chaine_caisse` n'avance que d'un rang vers un maillon existant, `serie_facture` ne recule pas.

### Conséquences

- La vérification ferme les angles morts de l'étape 14 : pièce sans maillon, `facture.empreinte` différente, trou de numérotation, ligne sans maillon. Elle a révélé dès son premier passage un défaut du seed : une ligne d'avoir sans ses champs chaînés.
- Sans la clé, un recalcul complet casse la signature de toute clôture déjà écrite. La fin de chaîne postérieure à la dernière clôture reste exposée, au plus un jour.
- Une base de développement semée avant cette étape garde l'ancien avoir : `pnpm caisse:verifier` y signale une rupture, à effacer en repartant d'une base neuve.
- Changer le format d'empreinte, les recalculs ou le format d'archive est une version majeure : nouvelles attestations (§ 380).
- **Aucune attestation avant l'étape 23** : Object Lock, KMS et sauvegardes sont des conditions, et les textes À VÉRIFIER doivent être levés (voir `docs/CAISSE.md`).
