# AudioGest – règles pour Claude Code

## Contexte
Logiciel de gestion complet pour centres d'audioprothèse en France (spécialité SESAM-Vitale 65, LPP titre II chapitre 3), vendu en SaaS à des réseaux et à des centres indépendants. Utilisateurs : audioprothésistes, assistantes, responsables de centre, administrateurs client, plus une console éditeur (nous). Interface et messages en français.
La facturation SESAM-Vitale (lecture Vitale, FSE, DRE, NOEMIE, SCOR) passera par AreaFSE (Area Santé) en mode masqué, derrière les ports VitaleReader et BillingEngine. On ne réimplémente JAMAIS la norme SESAM-Vitale. Tant que l'intégration n'est pas faite, les adaptateurs Fake simulent ces flux.

## Architecture
- packages/domain : règles métier pures, testées à 100 %. Aucun I/O.
- Ports dans packages/domain/ports : VitaleReader, BillingEngine, PecGateway, Notifier, ESignature, DocumentStore, PdfRenderer, NoahConnector, Clock, Hacheur, SignatureCaisse.
- Adaptateurs dans packages/adapters, avec un adaptateur Fake par port, utilisé en développement et en test.
- apps/web n'appelle jamais Prisma depuis un composant : tout passe par des services serveur (apps/web/server).
- Tâches longues ou planifiées (envois, imports, clôtures, purges) dans packages/jobs, toujours idempotentes.

## Multi-clients
- Chaque donnée métier porte organisationId. Isolation par Row Level Security PostgreSQL ET vérification dans les services. Aucune requête sans contexte client.
- Chaque nouvelle table arrive avec sa politique RLS et un test d'isolation.

## Règles de code
- TypeScript strict, pas de any. Validation Zod à chaque frontière (formulaires, API, imports, webhooks).
- Montants en centimes (entiers). Dates ISO 8601, fuseau Europe/Paris. Jamais new Date() dans le domaine : utiliser le port Clock.
- Chaque règle réglementaire = une fonction nommée + des tests table-driven + un commentaire « // Source : <document de docs/ref> <article ou page> ».
- Une règle absente de docs/ref ne s'invente pas : écrire « // À VÉRIFIER » et le signaler dans le résumé de fin.
- Migrations Prisma versionnées ; pas de db push hors développement.
- Chaque fonctionnalité : tests unitaires + un test d'intégration du service ; E2E pour les parcours critiques.

## Facturation et caisse
- Une facture validée ne se modifie ni ne se supprime : on émet un avoir.
- Numérotation continue, sans trou, une série par centre.
- Factures, avoirs, encaissements et clôtures sont chaînés (empreinte de l'enregistrement précédent) ; chaque événement sensible va dans le journal des événements de caisse.
- Aucun taux de TVA ni montant réglementaire en dur : paramètres datés ou référentiel LPP.

## Données et sécurité
- Aucune donnée patient réelle dans le dépôt, les tests, les seeds, les logs ou les prompts. Données de démo générées, NIR fictifs.
- NIR et données de santé chiffrés au repos (chiffrement applicatif), jamais en clair dans les logs.
- Toute lecture ou modification d'un dossier patient écrit une ligne dans le journal d'audit.
- Droits par rôle et par centre, toujours vérifiés côté serveur.
- SMS et e-mails aux patients : aucune donnée de santé ; les documents passent par un lien sécurisé à durée limitée, jamais en pièce jointe.

## Documents de référence
- docs/ref : textes officiels (convention, LPP, devis normalisé, FR 201). Les lire avant de coder une règle.
- docs/REGLES_AUDIO.md : synthèse des règles avec leurs sources (créée à l'étape 6).
- docs/vendor/ (areafse, himsa, cnda, pec) : documentation des fournisseurs. Ne jamais inventer un endpoint, un champ ou un format.

## Façon de travailler
- Toujours un plan court d'abord ; attendre ma validation si la tâche touche le schéma de données, la facturation, la caisse ou une règle réglementaire.
- Petits commits. Fin de tâche : tests verts, typecheck OK, docs/DECISIONS.md et docs/PLAN.md à jour, liste des points À VÉRIFIER.
