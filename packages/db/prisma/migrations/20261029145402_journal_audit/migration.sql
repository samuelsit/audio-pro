-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'CONNEXION', 'ECHEC_CONNEXION', 'DECONNEXION');

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_id" TEXT,
    "utilisateur_id" TEXT,
    "utilisateur_libelle" TEXT NOT NULL,
    "role" "Role",
    "centre_id" TEXT,
    "action" "ActionAudit" NOT NULL,
    "entite_type" TEXT NOT NULL,
    "entite_id" TEXT,
    "patient_id" TEXT,
    "champs" JSONB,
    "details" JSONB,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_audit_organisation_id_horodatage_idx" ON "journal_audit"("organisation_id", "horodatage");

-- CreateIndex
CREATE INDEX "journal_audit_utilisateur_id_horodatage_idx" ON "journal_audit"("utilisateur_id", "horodatage");

-- CreateIndex
CREATE INDEX "journal_audit_patient_id_horodatage_idx" ON "journal_audit"("patient_id", "horodatage");

-- CreateIndex
CREATE INDEX "journal_audit_entite_type_entite_id_idx" ON "journal_audit"("entite_type", "entite_id");

-- Journal en ajout seul : toute modification ou suppression de ligne est refusée.
-- TRUNCATE reste possible (bases jetables de test) ; une future purge pour la durée de conservation
-- passera par une migration dédiée.
CREATE FUNCTION journal_audit_ajout_seul() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal_audit est en ajout seul : % refusé', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_audit_ajout_seul
  BEFORE UPDATE OR DELETE ON "journal_audit"
  FOR EACH ROW EXECUTE FUNCTION journal_audit_ajout_seul();
