-- SaaS multi-clients (ADR-016) : l'organisation devient un client.
CREATE TYPE "StatutOrganisation" AS ENUM ('ESSAI', 'ACTIF', 'SUSPENDU');

ALTER TABLE "organisation" RENAME COLUMN "nom" TO "raison_sociale";
ALTER TABLE "organisation"
  ADD COLUMN "siren" CHAR(9),
  ADD COLUMN "adresse_ligne1" TEXT,
  ADD COLUMN "adresse_ligne2" TEXT,
  ADD COLUMN "code_postal" TEXT,
  ADD COLUMN "ville" TEXT,
  ADD COLUMN "statut" "StatutOrganisation" NOT NULL DEFAULT 'ESSAI',
  ADD COLUMN "parametres" JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "organisation_siren_key" ON "organisation"("siren");

-- Organisation par défaut : la ligne existante porte déjà toutes les données. Son SIREN reste vide
-- plutôt que fictif.
UPDATE "organisation" SET "statut" = 'ACTIF';

ALTER TABLE "centre" ADD COLUMN "horaires_ouverture" JSONB;

-- Identifiants uniques par client : un doublon ne doit pas révéler un autre client.
DROP INDEX "centre_finess_key";
DROP INDEX "centre_numero_facturation_am_key";
CREATE UNIQUE INDEX "centre_organisation_id_finess_key" ON "centre"("organisation_id", "finess");
CREATE UNIQUE INDEX "centre_organisation_id_numero_facturation_am_key" ON "centre"("organisation_id", "numero_facturation_am");

-- SUPERADMIN : hors de toute organisation, et lui seul.
ALTER TABLE "utilisateur" ALTER COLUMN "organisation_id" DROP NOT NULL;
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_superadmin_sans_organisation"
  CHECK (("role" = 'SUPERADMIN') = ("organisation_id" IS NULL));

-- Reste nullable : échec de connexion sur compte inconnu, actions de la console.
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
