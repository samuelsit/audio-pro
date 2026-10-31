-- Rôles de connexion (ADR-016). Créés sans LOGIN ni mot de passe : `pnpm db:roles` les pose depuis
-- l'environnement. Pas de ALTER DEFAULT PRIVILEGES : une nouvelle table reste inaccessible tant qu'elle n'a
-- pas ses GRANT et sa politique.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ha_app') THEN
    CREATE ROLE ha_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ha_plateforme') THEN
    CREATE ROLE ha_plateforme NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ha_jobs') THEN
    CREATE ROLE ha_jobs NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO ha_app, ha_plateforme;
GRANT EXECUTE ON FUNCTION app_organisation_id() TO ha_app, ha_plateforme;

-- ha_app : tout le métier, soumis à la RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "centre",
  "utilisateur",
  "patient",
  "lecture_vitale",
  "fabricant",
  "modele_aide_auditive",
  "accessoire",
  "appareil",
  "mouvement_appareil",
  "mouvement_accessoire",
  "prescripteur",
  "dossier",
  "delivrance",
  "compteur_devis",
  "devis",
  "essai",
  "facture_preparee",
  "utilisateur_centre",
  "praticien",
  "praticien_centre",
  "couverture_amo",
  "couverture_amc",
  "modele_code_lpp",
  "stock_accessoire",
  "transition_dossier",
  "prescription",
  "prise_en_charge",
  "devis_offre",
  "devis_ligne",
  "signature_devis",
  "essai_appareil",
  "essai_rdv",
  "prolongation_essai",
  "session",
  "compte",
  "deux_facteurs"
TO ha_app;
GRANT SELECT ON "organisation", "lpp_version", "lpp_code", "lpp_fiche", "lpp_tarif", "lpp_lien" TO ha_app;
-- Le journal est en ajout seul, en plus de son trigger.
GRANT SELECT, INSERT ON "journal_audit" TO ha_app;

-- ha_plateforme : authentification et console. Aucune table patient, dossier, devis ou stock : BYPASSRLS
-- ne lui ouvre que ce qui suit, et la console éditeur ne lit aucune donnée de santé.
GRANT SELECT, INSERT, UPDATE ON "organisation" TO ha_plateforme;
GRANT SELECT, INSERT, UPDATE ON "utilisateur" TO ha_plateforme;
GRANT SELECT ON "utilisateur_centre" TO ha_plateforme;
GRANT SELECT ("id", "organisation_id", "nom", "actif") ON "centre" TO ha_plateforme;
GRANT SELECT, INSERT, UPDATE, DELETE ON "session", "compte", "deux_facteurs", "verification", "limitation_debit" TO ha_plateforme;
GRANT INSERT ON "journal_audit" TO ha_plateforme;

-- ha_jobs : la file de travaux, dans son propre schéma. Les travaux lisent le métier via ha_app.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION ha_jobs;
