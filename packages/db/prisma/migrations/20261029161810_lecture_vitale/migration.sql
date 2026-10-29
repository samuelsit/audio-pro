-- CreateEnum
CREATE TYPE "ResultatLectureVitale" AS ENUM ('SUCCES', 'AUCUN_LECTEUR', 'CARTE_ABSENTE', 'CARTE_INVALIDE', 'CARTE_BLOQUEE', 'ERREUR_TECHNIQUE');

-- CreateEnum
CREATE TYPE "SourceLectureVitale" AS ENUM ('CARTE', 'APCV');

-- CreateTable
CREATE TABLE "lecture_vitale" (
    "id" TEXT NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "centre_id" TEXT,
    "resultat" "ResultatLectureVitale" NOT NULL,
    "source" "SourceLectureVitale",
    "nombre_beneficiaires" INTEGER,

    CONSTRAINT "lecture_vitale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lecture_vitale_organisation_id_horodatage_idx" ON "lecture_vitale"("organisation_id", "horodatage");

-- CreateIndex
CREATE INDEX "lecture_vitale_utilisateur_id_horodatage_idx" ON "lecture_vitale"("utilisateur_id", "horodatage");

-- AddForeignKey
ALTER TABLE "lecture_vitale" ADD CONSTRAINT "lecture_vitale_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecture_vitale" ADD CONSTRAINT "lecture_vitale_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecture_vitale" ADD CONSTRAINT "lecture_vitale_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historique en ajout seul : toute modification ou suppression de ligne est refusée.
-- TRUNCATE reste possible (bases jetables de test).
CREATE FUNCTION lecture_vitale_ajout_seul() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lecture_vitale est en ajout seul : % refusé', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lecture_vitale_ajout_seul
  BEFORE UPDATE OR DELETE ON "lecture_vitale"
  FOR EACH ROW EXECUTE FUNCTION lecture_vitale_ajout_seul();
