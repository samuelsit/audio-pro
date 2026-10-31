-- Plus d'export vers Cosium (ADR-015) : EXPORTE et FACTURE_EXTERNE laissent place à FACTURE.
-- PostgreSQL ne retire pas une valeur d'enum : le type est recréé. Un changement de type réécrit la table
-- sans déclencher les triggers de ligne : l'ajout seul de transition_dossier n'est pas sollicité.
CREATE TYPE "StatutDossier_new" AS ENUM ('BROUILLON', 'PRESCRIPTION_OK', 'DEVIS_EMIS', 'DEVIS_SIGNE', 'EN_ESSAI', 'A_FACTURER', 'FACTURE', 'CLOS', 'ABANDONNE');

CREATE FUNCTION pg_temp.nouveau_statut(ancien "StatutDossier") RETURNS "StatutDossier_new" LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE ancien::text
    WHEN 'EXPORTE' THEN 'A_FACTURER'
    WHEN 'FACTURE_EXTERNE' THEN 'FACTURE'
    ELSE ancien::text
  END::"StatutDossier_new"
$$;

ALTER TABLE "dossier" ALTER COLUMN "statut" DROP DEFAULT;
ALTER TABLE "dossier" ALTER COLUMN "statut" TYPE "StatutDossier_new" USING pg_temp.nouveau_statut("statut");
ALTER TABLE "dossier" ALTER COLUMN "statut" SET DEFAULT 'BROUILLON';
ALTER TABLE "transition_dossier" ALTER COLUMN "statut_avant" TYPE "StatutDossier_new" USING pg_temp.nouveau_statut("statut_avant");
ALTER TABLE "transition_dossier" ALTER COLUMN "statut_apres" TYPE "StatutDossier_new" USING pg_temp.nouveau_statut("statut_apres");

DROP FUNCTION pg_temp.nouveau_statut("StatutDossier");
DROP TYPE "StatutDossier";
ALTER TYPE "StatutDossier_new" RENAME TO "StatutDossier";
