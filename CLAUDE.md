# HA-Gestion – règles pour Claude Code

## Contexte
Logiciel de gestion interne pour un réseau de centres d'audioprothèse en France (spécialité SESAM-Vitale 65, LPP titre II chapitre 3). Utilisateurs : audioprothésistes, assistantes, administrateur réseau. Interface et messages en français.
Pendant le MVP, la FSE et l'encaissement restent dans Cosium : notre logiciel produit un dossier « prêt à facturer » exporté vers Cosium. La facturation SESAM-Vitale sera branchée plus tard via AreaFSE (Area Santé) en mode masqué, derrière le port BillingEngine. On ne réimplémente JAMAIS la norme SESAM-Vitale.

## Architecture
- packages/domain : règles métier pures, testées à 100 %. Aucun I/O.
- Ports (interfaces) dans packages/domain/ports : VitaleReader, BillingEngine, LegacyExporter, DocumentStore, PdfRenderer, Clock.
- Adaptateurs dans packages/adapters, avec un adaptateur Fake par port, utilisé en dev et en test.
- apps/web n'appelle jamais Prisma depuis un composant : tout passe par des services serveur (apps/web/server).

## Règles de code
- TypeScript strict, pas de any. Validation Zod à chaque frontière (formulaires, API, imports).
- Montants en centimes (entiers). Dates ISO 8601, fuseau Europe/Paris. Jamais new Date() dans le domaine : utiliser le port Clock.
- Chaque règle réglementaire = une fonction nommée + des tests table-driven + un commentaire « // Source : <document de docs/ref> <article ou page> ».
- Une règle absente de docs/ref ne s'invente pas : écrire « // À VÉRIFIER » et le signaler dans le résumé de fin.
- Migrations Prisma versionnées ; pas de db push hors développement.
- Chaque fonctionnalité : tests unitaires + un test d'intégration du service ; E2E pour les parcours critiques.

## Données et sécurité
- Aucune donnée patient réelle dans le dépôt, les tests, les seeds, les logs ou les prompts. Données de démo générées, NIR fictifs.
- NIR et données de santé chiffrés au repos (chiffrement applicatif), jamais en clair dans les logs.
- Toute lecture ou modification d'un dossier patient écrit une ligne dans le journal d'audit.
- Droits par rôle (ADMIN, AUDIO, ASSISTANT) et par centre, toujours vérifiés côté serveur.

## Documents de référence
- docs/ref : textes officiels (convention, LPP, devis normalisé, FR 201). Les lire avant de coder une règle.
- docs/REGLES_AUDIO.md : synthèse des règles avec leurs sources (créée à l'étape 6).
- docs/vendor/areafse : documentation AreaFSE. Ne jamais inventer un endpoint, un champ ou un format.

## Façon de travailler
- Toujours un plan court d'abord ; attendre ma validation si la tâche touche le schéma de données ou une règle réglementaire.
- Petits commits. Fin de tâche : tests verts, typecheck OK, docs/DECISIONS.md et docs/PLAN.md à jour, liste des points À VÉRIFIER.
