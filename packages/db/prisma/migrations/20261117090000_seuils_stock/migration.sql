-- CreateTable
CREATE TABLE "seuil_stock" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "modele_id" TEXT,
    "accessoire_id" TEXT,
    "minimum" INTEGER NOT NULL,
    "cible" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seuil_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seuil_stock_centre_id_idx" ON "seuil_stock"("centre_id");

-- CreateIndex
CREATE INDEX "seuil_stock_modele_id_idx" ON "seuil_stock"("modele_id");

-- CreateIndex
CREATE INDEX "seuil_stock_accessoire_id_idx" ON "seuil_stock"("accessoire_id");

-- AddForeignKey
ALTER TABLE "seuil_stock" ADD CONSTRAINT "seuil_stock_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seuil_stock" ADD CONSTRAINT "seuil_stock_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seuil_stock" ADD CONSTRAINT "seuil_stock_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_aide_auditive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seuil_stock" ADD CONSTRAINT "seuil_stock_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "seuil_stock_modele_unique" ON "seuil_stock" ("centre_id", "modele_id") WHERE "modele_id" IS NOT NULL;
CREATE UNIQUE INDEX "seuil_stock_accessoire_unique" ON "seuil_stock" ("centre_id", "accessoire_id") WHERE "accessoire_id" IS NOT NULL;

ALTER TABLE "seuil_stock" ADD CONSTRAINT "seuil_stock_un_produit" CHECK (num_nonnulls("modele_id", "accessoire_id") = 1);
ALTER TABLE "seuil_stock" ADD CONSTRAINT "seuil_stock_bornes" CHECK ("minimum" >= 0 AND "cible" >= "minimum" AND "cible" > 0);

ALTER TABLE "seuil_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seuil_stock" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_organisation ON "seuil_stock"
  USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id());
CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON "seuil_stock"
  FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable();

GRANT SELECT, INSERT, UPDATE, DELETE ON "seuil_stock" TO ha_app;

CREATE TRIGGER zz_meme_organisation_centre_id BEFORE INSERT OR UPDATE OF "centre_id" ON "seuil_stock"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('centre', 'centre_id');
CREATE TRIGGER zz_meme_organisation_modele_id BEFORE INSERT OR UPDATE OF "modele_id" ON "seuil_stock"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('modele_aide_auditive', 'modele_id');
CREATE TRIGGER zz_meme_organisation_accessoire_id BEFORE INSERT OR UPDATE OF "accessoire_id" ON "seuil_stock"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('accessoire', 'accessoire_id');
