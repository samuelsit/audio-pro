-- CreateEnum
CREATE TYPE "OrigineAccuseCommande" AS ENUM ('LIEN', 'SAISIE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GabaritNotification" ADD VALUE 'BON_COMMANDE';
ALTER TYPE "GabaritNotification" ADD VALUE 'RELANCE_COMMANDE';

-- AlterTable
ALTER TABLE "commande" ADD COLUMN     "accuse_le" TIMESTAMPTZ(3),
ADD COLUMN     "accuse_origine" "OrigineAccuseCommande",
ADD COLUMN     "bon_pdf_cle" TEXT,
ADD COLUMN     "envoyee_le" TIMESTAMPTZ(3),
ADD COLUMN     "reference_fournisseur" TEXT,
ADD COLUMN     "relances" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "commande_id" TEXT;

-- CreateIndex
CREATE INDEX "notification_commande_id_idx" ON "notification"("commande_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un message part pour une réservation, un document ou une commande.
ALTER TABLE "notification" DROP CONSTRAINT "notification_une_source";
ALTER TABLE "notification" ADD CONSTRAINT "notification_une_source" CHECK (
  num_nonnulls("reservation_id", "lien_document_id", "commande_id") = 1
);

CREATE TRIGGER "notification_heriter_organisation_commande" BEFORE INSERT ON "notification"
  FOR EACH ROW WHEN (NEW."commande_id" IS NOT NULL)
  EXECUTE FUNCTION heriter_organisation('commande', 'commande_id');

CREATE TRIGGER zz_meme_organisation_commande_id BEFORE INSERT OR UPDATE OF "commande_id" ON "notification"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('commande', 'commande_id');

ALTER TABLE "commande" ADD CONSTRAINT "commande_relances_positives" CHECK ("relances" >= 0);
ALTER TABLE "commande" ADD CONSTRAINT "commande_motifs_chiffres" CHECK (
  ("motif_refus" IS NULL OR "motif_refus" LIKE 'v1.%')
  AND ("motif_annulation" IS NULL OR "motif_annulation" LIKE 'v1.%')
);

-- `ha_plateforme` voit quelles organisations ont une commande à relancer, jamais son contenu.
GRANT SELECT ("organisation_id", "statut", "accuse_le") ON "commande" TO ha_plateforme;
