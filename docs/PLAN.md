# Plan de réalisation

Une étape est cochée quand ses tests sont verts et le typecheck OK.

Numérotation du plan SaaS (ADR-015). Les références aux étapes dans `docs/DECISIONS.md` et dans le code antérieur à ce plan suivent l'ancienne numérotation : ancienne 7 → 10, 8 → 11, 9 → 12, 10 → 13, 11 → 14, 13 → 29, 14 → 20, 15 → 22, 16 → 23, 17 → 25 ; l'ancienne 12 (export Cosium) est supprimée.

## Phase A – Socle

- [x] **0** – Socle
- [ ] **1** – Clients, centres, comptes — à mettre à niveau
- [ ] **2** – Audit, chiffrement, interface — à mettre à niveau
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

- [ ] **7** – Agenda
- [ ] **8** – Prise de RDV en ligne

## Phase E – Dossier audiologique et appareillage

- [ ] **9** – Dossier audiologique
- [ ] **10** – Stock — à mettre à niveau
  - reporté à l'étape 14 : vente pilotée par le dossier
  - reporté à l'étape 29 : reprise des appareils de Cosium, sans passer par la machine à états
  - à planifier : recherche des détenteurs par modèle ou par lot pour la matériovigilance (art. 21), numéro de lot à décider
- [ ] **11** – Dossier d'appareillage et prescription — à mettre à niveau
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
