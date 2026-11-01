-- AlterEnum
ALTER TYPE "StatutAppareil" ADD VALUE 'REMPLACE';
ALTER TYPE "TypeMouvementAppareil" ADD VALUE 'ECHANGE';

-- AlterTable
ALTER TABLE "appareil" ADD COLUMN "parc_pret" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "remplace_par_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "appareil_remplace_par_id_key" ON "appareil"("remplace_par_id");

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_remplace_par_id_fkey" FOREIGN KEY ("remplace_par_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une référence entre clients est refusée par la base (ADR-019).
CREATE TRIGGER zz_meme_organisation_remplace_par_id BEFORE INSERT OR UPDATE OF "remplace_par_id" ON "appareil"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('appareil', 'remplace_par_id');
