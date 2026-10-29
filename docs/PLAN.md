# Plan de réalisation

Une étape est cochée quand ses tests sont verts, le typecheck OK et la CI verte.

- [x] **0** – Socle technique (monorepo, configs, Docker, CI)
- [ ] **1** – Authentification et centres — terminée en local le 2026-10-29 (tests, typecheck, E2E verts), à cocher quand la CI est verte
  - [x] Modèle : organisation, centres, utilisateurs (rôles, rattachements), praticiens (RPPS, ADELI, centres d'exercice) ; migration `auth_centres`
  - [x] Connexion e-mail + mot de passe (Better Auth), sessions en base, limitation de débit
  - [x] 2FA TOTP obligatoire pour l'ADMIN, facultative pour les autres ; mot de passe provisoire à changer
  - [x] Gardes `requireSession`, `requireRole`, `requireCentreAccess` ; sélecteur de centre courant (« Tous les centres » pour l'ADMIN)
  - [x] Écrans admin : centres, utilisateurs, praticiens ; page Équipe
  - [x] Seed : 3 centres, 1 admin, 2 audioprothésistes, 2 assistantes (fictifs)
  - [x] Tests : domaine 100 %, intégration (cloisonnement A/B, RPPS, unicités), E2E (assistante, ADMIN + 2FA, formulaires admin)
- [ ] **2** – Journal d'audit, chiffrement applicatif, layout
  - reporté de l'étape 1 : journaliser les actions d'administration (comptes, centres, praticiens) et les connexions
- [ ] **3** – Patients
- [ ] **4** – Lecture Vitale simulée
- [ ] **5** – Référentiels : LPP, catalogue, prescripteurs
- [ ] **6** – Moteur de règles audio
- [ ] **7** – Stock
- [ ] **8** – Dossier et prescription
- [ ] **9** – Devis normalisé
- [ ] **10** – Essai
- [ ] **11** – Facture préparée
- [ ] **12** – Export Cosium
- [ ] **13** – Reprise des données Cosium
- [ ] **14** – Renouvellements et tableau de bord
- [ ] **15** – Sécurité et RGPD
  - reporté de l'étape 1 : réinitialisation du mot de passe par e-mail, liste et révocation des sessions par l'utilisateur
- [ ] **16** – E2E et déploiement
- [ ] **17** – Préparation AreaFSE
