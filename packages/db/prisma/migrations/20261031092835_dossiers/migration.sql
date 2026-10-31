-- CreateEnum
CREATE TYPE "StatutDossier" AS ENUM ('BROUILLON', 'PRESCRIPTION_OK', 'DEVIS_EMIS', 'DEVIS_SIGNE', 'EN_ESSAI', 'A_FACTURER', 'EXPORTE', 'FACTURE_EXTERNE', 'CLOS', 'ABANDONNE');

-- CreateEnum
CREATE TYPE "OreillesDossier" AS ENUM ('DROITE', 'GAUCHE', 'LES_DEUX');

-- CreateEnum
CREATE TYPE "Oreille" AS ENUM ('DROITE', 'GAUCHE');

-- CreateEnum
CREATE TYPE "TypeAppareillage" AS ENUM ('PRIMO', 'RENOUVELLEMENT');

-- CreateEnum
CREATE TYPE "OrigineDelivrance" AS ENUM ('DOSSIER', 'REPRISE');

-- CreateTable
CREATE TABLE "dossier" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "praticien_id" TEXT NOT NULL,
    "oreilles" "OreillesDossier" NOT NULL,
    "type_droite" "TypeAppareillage",
    "type_gauche" "TypeAppareillage",
    "statut" "StatutDossier" NOT NULL DEFAULT 'BROUILLON',
    "date_ouverture" DATE NOT NULL,
    "surdicecite" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transition_dossier" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "statut_avant" "StatutDossier",
    "statut_apres" "StatutDossier" NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateur_id" TEXT NOT NULL,
    "motif" TEXT,

    CONSTRAINT "transition_dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription" (
    "id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "prescripteur_id" TEXT NOT NULL,
    "date_prescription" DATE NOT NULL,
    "oreilles" "OreillesDossier" NOT NULL,
    "mention_renouvellement" BOOLEAN NOT NULL,
    "scan_cle" TEXT NOT NULL,
    "scan_type" TEXT NOT NULL,
    "scan_taille" INTEGER NOT NULL,
    "controles" JSONB NOT NULL,
    "forcee_par_id" TEXT,
    "motif_forcage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivrance" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "oreille" "Oreille" NOT NULL,
    "date_delivrance" DATE NOT NULL,
    "dossier_id" TEXT,
    "origine" "OrigineDelivrance" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivrance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dossier_patient_id_idx" ON "dossier"("patient_id");

-- CreateIndex
CREATE INDEX "dossier_centre_id_statut_idx" ON "dossier"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "transition_dossier_dossier_id_horodatage_idx" ON "transition_dossier"("dossier_id", "horodatage");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_scan_cle_key" ON "prescription"("scan_cle");

-- CreateIndex
CREATE INDEX "prescription_dossier_id_created_at_idx" ON "prescription"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "delivrance_patient_id_idx" ON "delivrance"("patient_id");

-- CreateIndex
CREATE INDEX "mouvement_appareil_dossier_id_idx" ON "mouvement_appareil"("dossier_id");

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "praticien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_dossier" ADD CONSTRAINT "transition_dossier_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_dossier" ADD CONSTRAINT "transition_dossier_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_prescripteur_id_fkey" FOREIGN KEY ("prescripteur_id") REFERENCES "prescripteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_forcee_par_id_fkey" FOREIGN KEY ("forcee_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivrance" ADD CONSTRAINT "delivrance_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivrance" ADD CONSTRAINT "delivrance_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivrance" ADD CONSTRAINT "delivrance_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un type par oreille concernée, et seulement pour elle : le devis normalisé le demande oreille par oreille.
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_type_droite_coherent"
  CHECK (("type_droite" IS NOT NULL) = ("oreilles" IN ('DROITE', 'LES_DEUX')));
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_type_gauche_coherent"
  CHECK (("type_gauche" IS NOT NULL) = ("oreilles" IN ('GAUCHE', 'LES_DEUX')));

ALTER TABLE "prescription" ADD CONSTRAINT "prescription_scan_taille_positive" CHECK ("scan_taille" > 0);
-- Un forçage a toujours un auteur et un motif.
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_forcage_complet"
  CHECK (("forcee_par_id" IS NULL) = ("motif_forcage" IS NULL));

-- Colonnes chiffrées par l'application (voir ADR-005).
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_surdicecite_chiffree" CHECK ("surdicecite" LIKE 'v1.%');
ALTER TABLE "transition_dossier" ADD CONSTRAINT "transition_dossier_motif_chiffre" CHECK ("motif" LIKE 'v1.%');
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_motif_forcage_chiffre" CHECK ("motif_forcage" LIKE 'v1.%');

-- Historiques en ajout seul : même fonction que les mouvements de stock.
CREATE TRIGGER transition_dossier_ajout_seul
  BEFORE UPDATE OR DELETE ON "transition_dossier"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();

CREATE TRIGGER prescription_ajout_seul
  BEFORE UPDATE OR DELETE ON "prescription"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();
