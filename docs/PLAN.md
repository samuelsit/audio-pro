# Plan de réalisation

Une étape est cochée quand ses tests sont verts et le typecheck OK.

Numérotation du plan SaaS (ADR-015). Les références aux étapes dans `docs/DECISIONS.md` et dans le code antérieur à ce plan suivent l'ancienne numérotation : ancienne 7 → 10, 8 → 11, 9 → 12, 10 → 13, 11 → 14, 13 → 29, 14 → 20, 15 → 22, 16 → 23, 17 → 25 ; l'ancienne 12 (export Cosium) est supprimée.

## Phase A – Socle

- [x] **0** – Socle
- [ ] **1** – Clients, centres, comptes — à mettre à niveau
  - [x] Organisation (raison sociale, SIREN, adresse, statut, paramètres) ; `organisation_id` sur toutes les tables métier, RLS forcée, 4 rôles PostgreSQL (ADR-016) ; 6 migrations
  - [x] Contexte client à chaque requête : `base(acteur)`, `enTransaction` ; `prisma()` réservé à `@ha/db/admin`
  - [x] Rôles ADMIN_CLIENT, RESPONSABLE_CENTRE, AUDIO, ASSISTANT, SUPERADMIN ; 2FA obligatoire pour ADMIN_CLIENT et SUPERADMIN (ADR-017)
  - [x] Console SUPERADMIN : liste, création, suspension et réactivation des clients
  - [x] Centre : SIRET obligatoire à la saisie, horaires d'ouverture
  - [x] Seed : réseau de 3 centres, centre indépendant, compte éditeur
  - [x] Tests : isolation sur chaque table et garde-fou du catalogue, identifiants forcés sur les services et en E2E, console, responsable
  - reporté à l'étape 23 : création du premier SUPERADMIN en production, droits du rôle de migration, proxy de confiance pour `x-forwarded-for`
  - [x] Références entre clients refusées par la base, sur 63 relations (ADR-019)
  - à arbitrer à l'étape 22 : 2FA du responsable, empreinte NIR et stockage par client, consultation du journal sans organisation
- [ ] **2** – Audit, chiffrement, interface — à mettre à niveau
  - [x] Journal : organisation avec clé étrangère, action SEND, ajout seul aussi par les droits ; lignes sans organisation invisibles des clients
  - [x] Menu : Agenda, Patients, Dossiers, Stock, Commandes, Facturation, Caisse, Tiers payant, SAV, Relances, Tableau de bord, Administration ; sous-navigations
  - [x] `packages/jobs` (pg-boss, ADR-018) et Mailpit
  - reporté à l'étape 22 : adresse IP et agent utilisateur dans le journal, durée de conservation et purge, script de rechiffrement en masse

## Phase B – Patients et lecture Vitale

- [x] **3** – Patients
  - reporté : recherche par nom de patient dans le filtre du journal d'audit, contrôle de cohérence entre le NIR et le sexe ou la date de naissance, historique des couvertures
- [x] **4** – Lecture Vitale simulée
  - reporté : écran de consultation de l'historique des lectures, date de début des droits AMO en base, droits appréciés à la date de délivrance (étape 14), lecteur réel AreaFSE (étape 25)

## Phase C – Référentiels et moteur de règles audio

- [x] **5** – Référentiels LPP, catalogue, prescripteurs
- [x] **6** – Moteur de règles audio
  - À VÉRIFIER : voir la liste de `docs/REGLES_AUDIO.md` ; le texte de la nomenclature LPP en lèverait la plupart
  - en attente : contrôles comp/incomp, aucun document ne les définit

## Phase D – Agenda et prise de RDV en ligne

- [x] **7** – Agenda (ADR-020)
  - À VÉRIFIER : `btree_gist` chez l'hébergeur HDS (étape 23)
  - à arbitrer : réservation pour un patient d'un centre hors périmètre, dépistage réalisé par un assistant (seuls les AUDIO ont une fiche praticien)
  - reporté à l'étape 13 : alimentation d'`EssaiRdv` depuis un RDV `VU` (`dossierId` et `natureEssai` sont prêts)
  - reporté à l'étape 19 : abonnés aux événements `RDV_CREE`, `RDV_DEPLACE`, `RDV_ANNULE` (liste vide dans `packages/jobs/src/abonnes.ts`)
  - reporté à l'étape 22 : durée de conservation des prospects jamais convertis, purge de `evenement_domaine`
- [x] **8** – Prise de RDV en ligne (ADR-021)
  - À VÉRIFIER : texte du consentement RGPD et base légale des SMS de confirmation, absents de `docs/ref`
  - À VÉRIFIER : le nom du centre dans un SMS révèle le recours à un audioprothésiste
  - à choisir : fournisseur de SMS et d'e-mail (documentation à déposer dans `docs/vendor`) ; sans lui, la réservation reste fermée en production
  - bloquant avant ouverture, reporté à l'étape 23 : `PROXIES_DE_CONFIANCE`, sinon la limitation par adresse IP se contourne
  - reporté à l'étape 19 : messages aux patients qui n'ont pas réservé en ligne
  - reporté à l'étape 22 : durées de conservation (prospects jamais convertis, notifications, contacts)

## Phase E – Dossier audiologique et appareillage

- [ ] **9** – Dossier audiologique
- [ ] **10** – Stock — à mettre à niveau
  - reporté à l'étape 14 : vente pilotée par le dossier
  - reporté à l'étape 29 : reprise des appareils de Cosium, sans passer par la machine à états
  - à planifier : recherche des détenteurs par modèle ou par lot pour la matériovigilance (art. 21), numéro de lot à décider
- [ ] **11** – Dossier d'appareillage et prescription — à mettre à niveau
  - [x] Statuts alignés sur le prompt 11 : `EXPORTE` et `FACTURE_EXTERNE` remplacés par `FACTURE` (ADR-015)
  - À VÉRIFIER : date de comparaison des 4 ans, exigence du RPPS du prescripteur, effet de la mention de renouvellement (voir `docs/REGLES_AUDIO.md`)
  - à arbitrer : retour arrière après un devis refusé
  - reporté à l'étape 14 : écriture de `Delivrance`
  - reporté à l'étape 29 : reprise des délivrances Cosium ; d'ici là, un patient sans ligne ressort éligible
  - reporté à l'étape 20 : liste `/dossiers` du menu
  - à planifier : avertissement si deux dossiers ouverts portent sur la même oreille, service S3 en CI
- [ ] **12** – Devis normalisé et signature — à mettre à niveau
  - À VÉRIFIER : TVA, code de regroupement, identifiants d'entreprise, départ de la garantie, mentions anciennes du modèle (voir `docs/REGLES_AUDIO.md`)
  - reporté à l'étape 22 : fichier du logo commercial (cadre vide au PDF)
  - reporté à l'étape 23 : image Docker avec Chromium et `PDF_CHROMIUM_CHEMIN`
  - à planifier : fiche technique stockée au catalogue (case déclarative pour le MVP), signature électronique
- [ ] **13** – Essai — à mettre à niveau
  - À VÉRIFIER : autre modèle en cours d'essai, nombre de prolongations et demande après l'échéance, contenu du compte rendu (voir `docs/REGLES_AUDIO.md`)
  - reporté à l'étape 14 : `RESERVE` → `VENDU`, fermeture du lien à la vente, retrait du `VENDU` manuel, écriture de `Delivrance`
  - à arbitrer : embouts sur mesure facturés à l'abandon, nouvelle période d'essai après un échec (un dossier n'a qu'un essai), correction d'un rendez-vous saisi par erreur

## Phase F – Facturation, caisse et tiers payant

- [ ] **14** – Facturation — à faire évoluer depuis FacturePreparee
  - À VÉRIFIER : sens de `RJT`, délai de lecture Vitale, confirmation manuelle, procédure de PEC et répartition, part AMC C2S sur les consommables, logiciels de caisse (voir `docs/REGLES_AUDIO.md`)
  - à reprendre : vente, `Delivrance`, sortie de stock des piles et accessoires (reportés depuis l'ancienne étape 12)
  - à planifier : saisie de la PEC avant l'achat (la table le permet), codes `7xxxxxx` reliés au catalogue, port `BillingEngine`
- [ ] **15** – Encaissement et caisse
- [ ] **16** – Tiers payant et PEC

## Phase G – Commandes fabricants et SAV

- [ ] **17** – Commandes fabricants
- [ ] **18** – SAV, garanties, prêts

## Phase H – Relances

- [ ] **19** – Relances et communication

## Phase I – Pilotage

- [ ] **20** – Renouvellements et tableau de bord

## Phase J – Produit commercial

- [ ] **21** – Onboarding client et abonnements
- [ ] **22** – Sécurité et RGPD
  - reporté de l'étape 1 : réinitialisation du mot de passe par e-mail, liste et révocation des sessions par l'utilisateur
- [ ] **23** – E2E et déploiement HDS

## Phase K – Intégrations soumises à prérequis

- [ ] **24** – NOAH
- [ ] **25** – AreaFSE : analyse et lecture Vitale réelle
- [ ] **26** – AreaFSE : FSE, DRE, NOEMIE, SCOR
- [ ] **27** – Préparation de l'agrément CNDA
- [ ] **28** – PEC en EDI

## Phase L – Migration et bascule

- [ ] **29** – Migration depuis Cosium
- [ ] **30** – Pilote et bascule
