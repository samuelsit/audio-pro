-- CreateEnum
CREATE TYPE "StatutRetourFabricant" AS ENUM ('PREPARE', 'ENVOYE', 'REPARE', 'ECHANGE', 'REFUSE', 'ANNULE');

-- CreateTable
CREATE TABLE "retour_fabricant" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "numero" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "fournisseur_id" TEXT NOT NULL,
    "ticket_sav_id" TEXT,
    "appareil_id" TEXT,
    "ecart_achat_id" TEXT,
    "description_panne" TEXT,
    "bon_pdf_cle" TEXT,
    "transporteur" TEXT,
    "numero_suivi" TEXT,
    "statut" "StatutRetourFabricant" NOT NULL DEFAULT 'PREPARE',
    "date_bon" DATE NOT NULL,
    "date_envoi" DATE,
    "date_retour" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retour_fabricant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retour_fabricant_centre_id_statut_idx" ON "retour_fabricant"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "retour_fabricant_ticket_sav_id_idx" ON "retour_fabricant"("ticket_sav_id");

-- CreateIndex
CREATE INDEX "retour_fabricant_appareil_id_idx" ON "retour_fabricant"("appareil_id");

-- CreateIndex
CREATE INDEX "retour_fabricant_ecart_achat_id_idx" ON "retour_fabricant"("ecart_achat_id");

-- CreateIndex
CREATE INDEX "retour_fabricant_fournisseur_id_idx" ON "retour_fabricant"("fournisseur_id");

-- CreateIndex
CREATE UNIQUE INDEX "retour_fabricant_organisation_id_numero_key" ON "retour_fabricant"("organisation_id", "numero");

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_ticket_sav_id_fkey" FOREIGN KEY ("ticket_sav_id") REFERENCES "ticket_sav"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_ecart_achat_id_fkey" FOREIGN KEY ("ecart_achat_id") REFERENCES "ecart_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_source"
  CHECK ("appareil_id" IS NOT NULL OR "ecart_achat_id" IS NOT NULL);
ALTER TABLE "retour_fabricant" ADD CONSTRAINT "retour_fabricant_chiffre"
  CHECK ("description_panne" IS NULL OR "description_panne" LIKE 'v1.%');

ALTER TABLE "retour_fabricant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retour_fabricant" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_organisation ON "retour_fabricant"
  USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id());
CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON "retour_fabricant"
  FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable();
GRANT SELECT, INSERT, UPDATE ON "retour_fabricant" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('centre_id', 'centre'),
    ('fournisseur_id', 'fournisseur'),
    ('ticket_sav_id', 'ticket_sav'),
    ('appareil_id', 'appareil'),
    ('ecart_achat_id', 'ecart_achat'),
    ('created_by_id', 'utilisateur')
  ) AS v(col, ref)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON "retour_fabricant" FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.col, r.col, r.ref, r.col
    );
  END LOOP;
END;
$$;
