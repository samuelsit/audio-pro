-- CreateEnum
CREATE TYPE "IssueEssai" AS ENUM ('ACHAT', 'ABANDON');

-- CreateEnum
CREATE TYPE "TypeRdvEssai" AS ENUM ('POSE', 'CONTROLE', 'FIN_ESSAI');

-- CreateTable
CREATE TABLE "essai" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "date_debut" DATE NOT NULL,
    "issue" "IssueEssai",
    "date_fin" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essai_appareil" (
    "id" TEXT NOT NULL,
    "essai_id" TEXT NOT NULL,
    "appareil_id" TEXT NOT NULL,
    "oreille" "Oreille" NOT NULL,
    "pose_le" DATE NOT NULL,
    "pose_par_id" TEXT NOT NULL,
    "retire_le" DATE,
    "retire_par_id" TEXT,
    "motif_retrait" TEXT,

    CONSTRAINT "essai_appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essai_rdv" (
    "id" TEXT NOT NULL,
    "essai_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "TypeRdvEssai" NOT NULL,
    "compte_rendu" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essai_rdv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prolongation_essai" (
    "id" TEXT NOT NULL,
    "essai_id" TEXT NOT NULL,
    "date_demande" DATE NOT NULL,
    "jours" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "justificatif_cle" TEXT NOT NULL,
    "justificatif_type" TEXT NOT NULL,
    "justificatif_taille" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prolongation_essai_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "essai_dossier_id_key" ON "essai"("dossier_id");

-- CreateIndex
CREATE INDEX "essai_organisation_id_issue_idx" ON "essai"("organisation_id", "issue");

-- CreateIndex
CREATE INDEX "essai_appareil_essai_id_idx" ON "essai_appareil"("essai_id");

-- CreateIndex
CREATE INDEX "essai_appareil_appareil_id_idx" ON "essai_appareil"("appareil_id");

-- CreateIndex
CREATE INDEX "essai_rdv_essai_id_date_idx" ON "essai_rdv"("essai_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "prolongation_essai_essai_id_key" ON "prolongation_essai"("essai_id");

-- CreateIndex
CREATE UNIQUE INDEX "prolongation_essai_justificatif_cle_key" ON "prolongation_essai"("justificatif_cle");

-- AddForeignKey
ALTER TABLE "essai" ADD CONSTRAINT "essai_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai" ADD CONSTRAINT "essai_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai" ADD CONSTRAINT "essai_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_essai_id_fkey" FOREIGN KEY ("essai_id") REFERENCES "essai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_pose_par_id_fkey" FOREIGN KEY ("pose_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_retire_par_id_fkey" FOREIGN KEY ("retire_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai_rdv" ADD CONSTRAINT "essai_rdv_essai_id_fkey" FOREIGN KEY ("essai_id") REFERENCES "essai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essai_rdv" ADD CONSTRAINT "essai_rdv_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prolongation_essai" ADD CONSTRAINT "prolongation_essai_essai_id_fkey" FOREIGN KEY ("essai_id") REFERENCES "essai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prolongation_essai" ADD CONSTRAINT "prolongation_essai_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Issue et date de fin vont ensemble.
ALTER TABLE "essai" ADD CONSTRAINT "essai_issue_date_fin"
  CHECK (("issue" IS NULL) = ("date_fin" IS NULL));

-- Un retrait a une date et un auteur ; le motif ne s'écrit que sur un retrait.
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_retrait_complet"
  CHECK (("retire_le" IS NULL) = ("retire_par_id" IS NULL)
    AND ("motif_retrait" IS NULL OR "retire_le" IS NOT NULL));

-- Durée d'une prolongation : 15 jours au plus (convention art. 18 3°, p. 20).
ALTER TABLE "prolongation_essai" ADD CONSTRAINT "prolongation_essai_jours"
  CHECK ("jours" BETWEEN 1 AND 15);

-- Champs chiffrés.
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_motif_retrait_chiffre" CHECK ("motif_retrait" LIKE 'v1.%');
ALTER TABLE "essai_rdv" ADD CONSTRAINT "essai_rdv_compte_rendu_chiffre" CHECK ("compte_rendu" LIKE 'v1.%');
ALTER TABLE "prolongation_essai" ADD CONSTRAINT "prolongation_essai_motif_chiffre" CHECK ("motif" LIKE 'v1.%');

-- Un appareil actif par oreille ; un appareil n'est tenu que par un essai à la fois.
CREATE UNIQUE INDEX "essai_appareil_actif_par_oreille" ON "essai_appareil" ("essai_id", "oreille") WHERE "retire_le" IS NULL;
CREATE UNIQUE INDEX "essai_appareil_actif_par_appareil" ON "essai_appareil" ("appareil_id") WHERE "retire_le" IS NULL;

-- Les rendez-vous sont des traces : ajout seul.
CREATE TRIGGER essai_rdv_ajout_seul
  BEFORE UPDATE OR DELETE ON "essai_rdv"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();
