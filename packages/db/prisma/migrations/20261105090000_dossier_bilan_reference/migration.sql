-- AlterTable
ALTER TABLE "dossier" ADD COLUMN "bilan_reference_id" TEXT;

-- CreateIndex
CREATE INDEX "dossier_bilan_reference_id_idx" ON "dossier"("bilan_reference_id");

-- AddForeignKey
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_bilan_reference_id_fkey" FOREIGN KEY ("bilan_reference_id") REFERENCES "bilan_audiologique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "zz_meme_organisation_bilan_reference_id" BEFORE INSERT OR UPDATE OF "bilan_reference_id" ON "dossier"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('bilan_audiologique', 'bilan_reference_id');
