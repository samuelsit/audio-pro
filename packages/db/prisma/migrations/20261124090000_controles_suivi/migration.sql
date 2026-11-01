-- CreateEnum
CREATE TYPE "StatutControleSuivi" AS ENUM ('PLANIFIE', 'IGNORE');

-- CreateTable
CREATE TABLE "controle_suivi" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "patient_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "date_reference" DATE NOT NULL,
    "rang" INTEGER NOT NULL,
    "statut" "StatutControleSuivi" NOT NULL,
    "rendez_vous_id" TEXT,
    "motif" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_suivi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_suivi_centre_id_idx" ON "controle_suivi"("centre_id");

-- CreateIndex
CREATE INDEX "controle_suivi_rendez_vous_id_idx" ON "controle_suivi"("rendez_vous_id");

-- CreateIndex
CREATE UNIQUE INDEX "controle_suivi_patient_id_date_reference_rang_key" ON "controle_suivi"("patient_id", "date_reference", "rang");

-- AddForeignKey
ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_chiffre" CHECK ("motif" IS NULL OR "motif" LIKE 'v1.%');
ALTER TABLE "controle_suivi" ADD CONSTRAINT "controle_suivi_rang" CHECK ("rang" >= 1);

ALTER TABLE "controle_suivi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "controle_suivi" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_organisation ON "controle_suivi"
  USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id());
CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON "controle_suivi"
  FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable();
GRANT SELECT, INSERT, UPDATE, DELETE ON "controle_suivi" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('patient_id', 'patient'),
    ('centre_id', 'centre'),
    ('rendez_vous_id', 'rendez_vous'),
    ('created_by_id', 'utilisateur')
  ) AS v(col, ref)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON "controle_suivi" FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.col, r.col, r.ref, r.col
    );
  END LOOP;
END;
$$;
