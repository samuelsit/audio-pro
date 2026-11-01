-- AlterEnum
ALTER TYPE "GabaritNotification" ADD VALUE 'DOCUMENT_A_CONSULTER';

-- CreateEnum
CREATE TYPE "CibleLienDocument" AS ENUM ('DEVIS', 'COMPTE_RENDU_ESSAI');

-- CreateEnum
CREATE TYPE "DestinataireLien" AS ENUM ('PATIENT', 'PRESCRIPTEUR');

-- AlterTable
ALTER TABLE "notification" ALTER COLUMN "reservation_id" DROP NOT NULL;
ALTER TABLE "notification" ADD COLUMN "lien_document_id" TEXT;

-- CreateTable
CREATE TABLE "lien_document" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "dossier_id" TEXT NOT NULL,
    "cible" "CibleLienDocument" NOT NULL,
    "destinataire" "DestinataireLien" NOT NULL,
    "pdf_cle" TEXT NOT NULL,
    "expire_le" TIMESTAMPTZ(3) NOT NULL,
    "revoque_le" TIMESTAMPTZ(3),
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "bloque_le" TIMESTAMPTZ(3),
    "ouvertures" INTEGER NOT NULL DEFAULT 0,
    "derniere_ouverture_le" TIMESTAMPTZ(3),
    "pdf_purge_le" TIMESTAMPTZ(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lien_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_lien_document_id_idx" ON "notification"("lien_document_id");

-- CreateIndex
CREATE INDEX "lien_document_dossier_id_created_at_idx" ON "lien_document"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "lien_document_cible_expire_le_idx" ON "lien_document"("cible", "expire_le");

-- CreateIndex
CREATE INDEX "lien_document_organisation_id_idx" ON "lien_document"("organisation_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_lien_document_id_fkey" FOREIGN KEY ("lien_document_id") REFERENCES "lien_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un message part soit pour une réservation, soit pour un document.
ALTER TABLE "notification" ADD CONSTRAINT "notification_une_source" CHECK (
  num_nonnulls("reservation_id", "lien_document_id") = 1
);

ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_tentatives_positives" CHECK ("tentatives" >= 0);

-- L'organisation d'un message vient de sa source, réservation ou lien.
DROP TRIGGER "notification_heriter_organisation" ON "notification";
CREATE TRIGGER "notification_heriter_organisation" BEFORE INSERT ON "notification"
  FOR EACH ROW WHEN (NEW."reservation_id" IS NOT NULL)
  EXECUTE FUNCTION heriter_organisation('reservation_en_ligne', 'reservation_id');
CREATE TRIGGER "notification_heriter_organisation_lien" BEFORE INSERT ON "notification"
  FOR EACH ROW WHEN (NEW."lien_document_id" IS NOT NULL)
  EXECUTE FUNCTION heriter_organisation('lien_document', 'lien_document_id');

CREATE TRIGGER "lien_document_heriter_organisation" BEFORE INSERT ON "lien_document"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('dossier', 'dossier_id');

ALTER TABLE "lien_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lien_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_organisation ON "lien_document"
  USING (organisation_id = app_organisation_id())
  WITH CHECK (organisation_id = app_organisation_id());
GRANT SELECT, INSERT, UPDATE ON "lien_document" TO ha_app;
CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON "lien_document"
  FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id)
  EXECUTE FUNCTION organisation_immuable();

CREATE TRIGGER "zz_meme_organisation_dossier_id" BEFORE INSERT OR UPDATE OF "dossier_id" ON "lien_document"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('dossier', 'dossier_id');
CREATE TRIGGER "zz_meme_organisation_created_by_id" BEFORE INSERT OR UPDATE OF "created_by_id" ON "lien_document"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('utilisateur', 'created_by_id');
CREATE TRIGGER "zz_meme_organisation_lien_document_id" BEFORE INSERT OR UPDATE OF "lien_document_id" ON "notification"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('lien_document', 'lien_document_id');
