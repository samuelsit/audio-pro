-- CreateEnum
CREATE TYPE "StatutPec" AS ENUM ('DEMANDEE', 'ACCORDEE', 'REFUSEE', 'SANS_TIERS_PAYANT');

-- CreateTable
CREATE TABLE "facture_preparee" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "date_delivrance" DATE NOT NULL,
    "amo_confirmee_le" TIMESTAMP(3),
    "amo_confirmee_par_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facture_preparee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prise_en_charge" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "statut" "StatutPec" NOT NULL,
    "organisme" TEXT,
    "plateforme" TEXT,
    "numero_accord" TEXT,
    "montant_accorde_centimes" INTEGER,
    "date_pec" DATE,
    "justificatif_cle" TEXT,
    "justificatif_type" TEXT,
    "justificatif_taille" INTEGER,
    "saisie_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prise_en_charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facture_preparee_dossier_id_key" ON "facture_preparee"("dossier_id");

-- CreateIndex
CREATE UNIQUE INDEX "prise_en_charge_dossier_id_key" ON "prise_en_charge"("dossier_id");

-- CreateIndex
CREATE UNIQUE INDEX "prise_en_charge_justificatif_cle_key" ON "prise_en_charge"("justificatif_cle");

-- AddForeignKey
ALTER TABLE "facture_preparee" ADD CONSTRAINT "facture_preparee_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_preparee" ADD CONSTRAINT "facture_preparee_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_preparee" ADD CONSTRAINT "facture_preparee_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_preparee" ADD CONSTRAINT "facture_preparee_amo_confirmee_par_id_fkey" FOREIGN KEY ("amo_confirmee_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_saisie_par_id_fkey" FOREIGN KEY ("saisie_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La confirmation de la couverture a une date et un auteur.
ALTER TABLE "facture_preparee" ADD CONSTRAINT "facture_preparee_confirmation_complete"
  CHECK (("amo_confirmee_le" IS NULL) = ("amo_confirmee_par_id" IS NULL));

-- Montant positif, renseigné uniquement sur un accord, avec son organisme et son numéro.
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_accord_complet"
  CHECK (("statut" = 'ACCORDEE') = ("montant_accorde_centimes" IS NOT NULL)
    AND ("montant_accorde_centimes" IS NULL OR "montant_accorde_centimes" >= 0)
    AND ("statut" <> 'ACCORDEE' OR ("organisme" IS NOT NULL AND "numero_accord" IS NOT NULL)));

-- Sans tiers payant, rien à renseigner ; sinon un organisme et une date.
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_organisme"
  CHECK (("statut" = 'SANS_TIERS_PAYANT') = ("organisme" IS NULL)
    AND ("statut" = 'SANS_TIERS_PAYANT') = ("date_pec" IS NULL));

-- Un justificatif a sa clé, son type et sa taille.
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_justificatif_complet"
  CHECK (("justificatif_cle" IS NULL) = ("justificatif_type" IS NULL)
    AND ("justificatif_cle" IS NULL) = ("justificatif_taille" IS NULL));
