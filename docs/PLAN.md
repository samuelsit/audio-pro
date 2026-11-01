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

- [x] **9** – Dossier audiologique (ADR-022)
  - À VÉRIFIER : intitulés français des grades BIAP, grille des trois fréquences consécutives (R24) ; pas de 5 dB et symboles (R25) ; anamnèse par défaut, questionnaires validés et leurs droits d'usage (R26)
  - reporté à l'étape 24 : port `NoahConnector`, import, correspondance des champs sur la documentation HIMSA, schéma de relecture sans le pas de 5 dB
  - reporté à l'étape 22 : durée de conservation des bilans et des photos, retrait d'une photo seule
- [x] **10** – Stock (ADR-023)
  - [x] clés étrangères de `commande_id`, avec leur trigger ; appel de `receptionnerDansTransaction` (étape 17)
  - à arbitrer : statut de sortie pour un appareil perdu (reste `EN_STOCK`, ressort manquant à chaque inventaire)
  - [x] vente pilotée par le dossier (étape 14)
  - reporté à l'étape 29 : reprise des appareils de Cosium, sans passer par la machine à états
  - à planifier : recherche des détenteurs par modèle ou par lot pour la matériovigilance (art. 21), numéro de lot à décider
- [x] **11** – Dossier d'appareillage et prescription (ADR-024)
  - [x] Statuts alignés sur le prompt 11 : `EXPORTE` et `FACTURE_EXTERNE` remplacés par `FACTURE` (ADR-015)
  - À VÉRIFIER : date de comparaison des 4 ans, exigence du RPPS du prescripteur, effet de la mention de renouvellement (voir `docs/REGLES_AUDIO.md`)
  - à arbitrer : retour arrière après un devis refusé
  - [x] écriture de `Delivrance` (étape 14)
  - reporté à l'étape 29 : reprise des délivrances Cosium ; d'ici là, un patient sans ligne ressort éligible
  - reporté à l'étape 20 : liste `/dossiers` du menu
  - à planifier : avertissement si deux dossiers ouverts portent sur la même oreille, service S3 en CI
- [x] **12** – Devis normalisé et signature (ADR-025, ADR-026)
  - À VÉRIFIER : TVA, code de regroupement, identifiants d'entreprise, départ de la garantie, mentions anciennes du modèle (voir `docs/REGLES_AUDIO.md`)
  - reporté à l'étape 22 : fichier du logo commercial (cadre vide au PDF)
  - reporté à l'étape 23 : image Docker avec Chromium et `PDF_CHROMIUM_CHEMIN`
  - à planifier : fiche technique stockée au catalogue (case déclarative pour le MVP)
  - À VÉRIFIER : valeur probante de la signature sur tablette, signature de l'audioprothésiste au § 5, fournisseur (`docs/vendor` vide) ; en production, seul le scan fonctionne
  - À VÉRIFIER : date de naissance comme second facteur (revue à l'étape 22), base légale des envois de documents
- [x] **13** – Essai (ADR-026, ADR-027)
  - À VÉRIFIER : heure conventionnelle des rendez-vous d'essai repris par la migration ; canal MSSanté vers le prescripteur
  - À VÉRIFIER : autre modèle en cours d'essai, nombre de prolongations et demande après l'échéance, contenu du compte rendu (voir `docs/REGLES_AUDIO.md`)
  - [x] `RESERVE` → `VENDU`, fermeture du lien à la vente, retrait du `VENDU` manuel, écriture de `Delivrance` (étape 14)
  - à arbitrer : embouts sur mesure facturés à l'abandon, nouvelle période d'essai après un échec (un dossier n'a qu'un essai), correction d'un rendez-vous saisi par erreur

## Phase F – Facturation, caisse et tiers payant

- [x] **14** – Facturation (ADR-028)
  - fait : `FacturePreparee` devenue `Facture`, données reprises ; vente directe ; TVA datée ; numérotation ; avoirs ; mentions ; PDF, duplicata et lien sécurisé ; vente, `Delivrance` et sortie de stock à la validation ; chaîne et journal de caisse ; `BillingEngine` et `FakeBillingEngine`
  - À VÉRIFIER : mentions obligatoires, TVA dont l'entretien, format et série de numérotation, avoir partiel, prescription et taux AMO d'une vente directe, sens de `RJT`, délai de lecture Vitale, confirmation manuelle, procédure de PEC, part AMC C2S sur les consommables, logiciels de caisse (voir `docs/REGLES_AUDIO.md`)
  - à arbitrer : retour en stock des piles et accessoires après un avoir, abandon d'un dossier revenu en `A_FACTURER`, retour physique d'un appareil
  - reporté à l'étape 15 : encaissements et clôtures dans la chaîne, écran de vérification de la chaîne
  - reporté à l'étape 26 : format réel de la FSE, correction d'une FSE après un avoir, suivi automatique des statuts
  - à planifier : codes `7xxxxxx` reliés au catalogue
  - à surveiller : deux tests de `facturation.int.test.ts` ont échoué une fois dans la suite complète, sur une machine chargée, sans message conservé ; non reproduit en 5 passages
- [x] **15** – Encaissement et caisse (ADR-029, `docs/CAISSE.md`)
  - fait : encaissements multi-modes sur facture, acomptes sur devis signé, rendu de monnaie, remboursement et annulation par opération inverse ; chaîne de format 2 avec horodatage et acteur ; signature Ed25519 des clôtures et archives ; journal des événements de caisse ; clôtures journalière, mensuelle et annuelle par centre, cumuls perpétuels, travail de nuit ; caisse du jour avec fond, comptage et écart justifié ; archives mensuelles vérifiables ; export paramétrable et FEC ; `pnpm caisse:verifier`, écran de vérification
  - À VÉRIFIER : art. 286 I 3° bis version du 27/06/2026 et format de restitution des archives, transfert au CIBS, portée pour les opérations facturées, TVA sur acomptes, facture d'acompte, plafond légal des espèces, jour sans opération, plan de comptes et écritures d'écart, format du FEC, plafond d'encaissement avant le tiers payant (voir `docs/REGLES_AUDIO.md`, R32 à R41)
  - à déposer dans `docs/ref/fiscal` : art. 286 du CGI, loi 2026-534 art. 87, art. L. 216-48 du CIBS, art. A47 A-1 du LPF (Légifrance refuse le téléchargement)
  - à valider : FEC et plan de comptes par l'expert-comptable ; `docs/CAISSE.md` par un conseil fiscal
  - à planifier : reçu d'encaissement en PDF ; téléchargement d'une archive en E2E (faute de pouvoir avancer l'horloge du serveur, couvert en intégration)
  - reporté à l'étape 16 : encaissements des organismes, plafond selon le tiers payant
  - reporté à l'étape 22 : durées de conservation et purge, face au RGPD
  - reporté à l'étape 23 : S3 Object Lock sur `archives-caisse/`, clé de signature en KMS et rotation, restauration de sauvegarde vérifiée. **Aucune attestation avant cette étape**
- [x] **16** – Tiers payant et PEC (ADR-030)
  - fait : PEC étendue, statuts, demande par ligne, saisie depuis le devis ; port `PecGateway` et `FakePecGateway`, déjà branchés à l'écran ; tiers payant AMO par facture ; créances AMO et AMC à la validation, échéances ; règlements d'organismes chaînés, parts AMO et AMC, annulation ; lettrage partiel et multiple, délettrage ; écarts, rejets, transfert au patient ; avoir répercuté sur les créances ; solde patient et trop-perçu corrigés ; écritures, vérification, archive, `VERSION_CAISSE` 2.0 ; référentiel des complémentaires ; écrans créances, règlements, rejets, impayés, export CSV
  - corrigé en passant : l'avoir qui solde reprend les acomptes déduits (défaut de l'étape 15)
  - À VÉRIFIER : procédure et validité de la PEC, délai des complémentaires, jours fériés, B2D, papier et AME, tiers payant obligatoire hors C2S, C2S gérée par un organisme complémentaire, pièce rectificative après un transfert, limites du lettrage, virements d'organismes dans les clôtures (voir `docs/REGLES_AUDIO.md`, R23, R42 à R46)
  - à valider : écritures du tiers payant et compte 654000 par l'expert-comptable
  - à déposer dans `docs/vendor/pec` : documentation des plateformes
  - reporté à l'étape 19 : courriers de relance (l'écran note la relance)
  - reporté à l'étape 26 : import NOEMIE et lettrage automatique, reversement d'un indu, date réelle de l'ARL
  - reporté à l'étape 28 : adaptateur réel de `PecGateway`

## Phase G – Commandes fabricants et SAV

- [x] **17** – Commandes fabricants (ADR-031)
  - fait : fournisseurs, contacts, centrales d'achat, numéros de client par centre, paramètres ; demande et commande, statuts déduits des quantités ; règles d'approbation paramétrables ; bon de commande PDF, envoi par e-mail avec pièce jointe, accusé par lien signé ou saisi, relances ; réception ligne à ligne, numéros de série, reliquat, écarts ; factures fournisseurs, dépôt et boîte mail, extraction locale, validation humaine, rapprochement commande, réception et facture ; relevé mensuel de centrale, prévisualisation et pointage ; seuils et proposition de réapprovisionnement ; statistiques d'achats, délais, écarts, export CSV ; ports `BoiteFactures`, `ExtracteurFacture`, `PlateformeFactures`
  - corrigé en passant : les libellés des formulaires répétés dans un tableau visaient tous la première ligne
  - À VÉRIFIER : facturation électronique, calendrier et factures concernées ; conservation des bons et factures d'achat ; oreille sur le bon ; format réel d'un relevé de centrale ; hors chaîne de caisse des factures d'achat (voir `docs/REGLES_AUDIO.md`, R47 à R51)
  - à choisir : fournisseur d'e-mail entrant et plateforme agréée (documentation à déposer dans `docs/vendor`). Sans eux, seul le dépôt à l'écran fait entrer des factures
  - à mesurer : l'extraction sur de vraies factures de fabricants, les tests n'utilisent que des PDF générés
  - à arbitrer : précisions de fabrication du sur-mesure (couleur, évent), une facture couvrant plusieurs centres, avoirs fournisseurs, prévenir le fabricant d'une annulation (message manuel pour l'instant)
  - [x] retour au fabricant d'un produit non conforme (étape 18)
  - reporté à l'étape 19 : prévenir l'approbateur d'une demande en attente (la liste filtrée suffit pour l'instant)
  - à planifier : EDI fabricant, à brancher sur `transmettreCommande` ; paiement des fournisseurs et écritures comptables d'achat
- [x] **18** – SAV, garanties, prêts (ADR-032)
  - fait : garantie par appareil née à la vente, durée paramétrable, assurance perte, vol et casse, reprise des appareils déjà vendus ; tickets avec diagnostic, action, couverture, restitution, facturation hors garantie en vente directe ; retours fabricant, bon PDF sans identité, suivi, issue, depuis un ticket, le stock ou un écart ; échange sous nouveau numéro, statut `REMPLACE`, lien et historique conservés ; parc de prêt par centre, prêts tracés, alerte de retard ; comptoir, ventes directes de l'assistant, compteur de piles, quota daté en console ; suivi post-appareillage, proposition de créneaux, RDV dans l'agenda
  - corrigé en passant : l'avoir qui solde forçait un appareil au SAV en `RESERVE` ; un appareil vendu passé au SAV remontait dans la valeur du stock ; un remplaçant pouvait s'annuler hors facture ; `validerFacture` acceptait un appareil réparé ; `ajouterMois` ne gérait pas un nombre de mois négatif
  - À VÉRIFIER : point de départ de la garantie, assurance, garantie et renouvellement après échange, ce qui se facture hors garantie (devis p. 2 § 4), série sur le bon de retour, quota de piles (voir `docs/REGLES_AUDIO.md`, R15, R19, R52 à R57)
  - bloquant pour facturer un ticket ou un entretien : taux de TVA de l'entretien à saisir en console (R18), à valider par l'expert-comptable
  - à déposer dans `docs/ref` : nomenclature LPP, pour le quota de piles et la portée des réparations
  - à arbitrer : appareil vendu par un autre centre ou hors réseau (un ticket suit le centre de l'appareil), appareil perdu sans remplacement, caution de prêt, avoir bloqué tant qu'un ticket est ouvert
  - reporté à l'étape 19 : messages au patient pour un prêt en retard, un contrôle à venir, un appareil à récupérer
  - reporté à l'étape 26 : télétransmission `SUI` de chaque prestation de suivi
  - à surveiller : `admin-2fa` et `tiers-payant` ont échoué une fois dans une suite E2E complète, sans lien établi avec le SAV (`tiers-payant` n'avait pas atteint l'écran du règlement) ; passés seuls, puis dans la suite complète suivante (59 sur 59)
  - à planifier : remplaçant pris dans le stock du centre, renouvellement anticipé depuis un ticket irréparable, recherche des détenteurs à travers les échanges, performance de la liste de suivi au-delà de quelques milliers de patients

## Phase H – Relances

- [ ] **19** – Relances et communication

## Phase I – Pilotage

- [ ] **20** – Renouvellements et tableau de bord

## Phase J – Produit commercial

- [ ] **21** – Onboarding client et abonnements
- [ ] **22** – Sécurité et RGPD
  - reporté de l'étape 1 : réinitialisation du mot de passe par e-mail, liste et révocation des sessions par l'utilisateur
- [ ] **23** – E2E et déploiement HDS
  - reporté de l'étape 15 : S3 Object Lock sur `archives-caisse/`, `CAISSE_SIGNATURE_CLE_PRIVEE` en KMS et rotation, restauration de sauvegarde suivie de `pnpm caisse:verifier` ; condition de la première attestation d'éditeur

## Phase K – Intégrations soumises à prérequis

- [ ] **24** – NOAH
- [ ] **25** – AreaFSE : analyse et lecture Vitale réelle
- [ ] **26** – AreaFSE : FSE, DRE, NOEMIE, SCOR
- [ ] **27** – Préparation de l'agrément CNDA
- [ ] **28** – PEC en EDI

## Phase L – Migration et bascule

- [ ] **29** – Migration depuis Cosium
- [ ] **30** – Pilote et bascule
