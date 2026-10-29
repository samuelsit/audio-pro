-- CreateEnum
CREATE TYPE "Civilite" AS ENUM ('M', 'MME');

-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('MASCULIN', 'FEMININ');

-- CreateEnum
CREATE TYPE "QualiteBeneficiaire" AS ENUM ('ASSURE', 'AYANT_DROIT');

-- CreateEnum
CREATE TYPE "OrigineDonnee" AS ENUM ('SAISIE', 'VITALE');

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "civilite" "Civilite" NOT NULL,
    "nom_naissance" TEXT NOT NULL,
    "nom_usage" TEXT,
    "prenoms" TEXT NOT NULL,
    "date_naissance" DATE NOT NULL,
    "sexe" "Sexe" NOT NULL,
    "adresse_ligne1" TEXT,
    "adresse_ligne2" TEXT,
    "code_postal" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "medecin_traitant" TEXT,
    "consentement_sms" BOOLEAN NOT NULL DEFAULT false,
    "consentement_email" BOOLEAN NOT NULL DEFAULT false,
    "consentement_courrier" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "nom_naissance_recherche" TEXT NOT NULL,
    "nom_usage_recherche" TEXT,
    "prenoms_recherche" TEXT NOT NULL,
    "fusionne_dans_id" TEXT,
    "fusionne_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couverture_amo" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "nir" TEXT NOT NULL,
    "nir_empreinte" CHAR(64) NOT NULL,
    "rang_naissance" INTEGER NOT NULL,
    "qualite" "QualiteBeneficiaire" NOT NULL,
    "regime" TEXT,
    "caisse" TEXT,
    "centre_gestionnaire" TEXT,
    "fin_droits" DATE,
    "c2s" BOOLEAN NOT NULL DEFAULT false,
    "ald" TEXT NOT NULL,
    "origine" "OrigineDonnee" NOT NULL,
    "derniere_lecture_vitale" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "couverture_amo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couverture_amc" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "organisme_nom" TEXT NOT NULL,
    "organisme_identifiant" TEXT,
    "numero_adherent" TEXT,
    "type_contrat" TEXT,
    "debut_validite" DATE,
    "fin_validite" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "couverture_amc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_organisation_id_nom_naissance_recherche_idx" ON "patient"("organisation_id", "nom_naissance_recherche");

-- CreateIndex
CREATE INDEX "patient_organisation_id_nom_usage_recherche_idx" ON "patient"("organisation_id", "nom_usage_recherche");

-- CreateIndex
CREATE INDEX "patient_organisation_id_date_naissance_idx" ON "patient"("organisation_id", "date_naissance");

-- CreateIndex
CREATE INDEX "patient_centre_id_idx" ON "patient"("centre_id");

-- CreateIndex
CREATE UNIQUE INDEX "couverture_amo_patient_id_key" ON "couverture_amo"("patient_id");

-- CreateIndex
CREATE INDEX "couverture_amo_nir_empreinte_idx" ON "couverture_amo"("nir_empreinte");

-- CreateIndex
CREATE UNIQUE INDEX "couverture_amc_patient_id_key" ON "couverture_amc"("patient_id");

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_fusionne_dans_id_fkey" FOREIGN KEY ("fusionne_dans_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couverture_amo" ADD CONSTRAINT "couverture_amo_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couverture_amc" ADD CONSTRAINT "couverture_amc_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Champs chiffrés par l'application (ADR-005) : toute valeur écrite en clair par erreur est refusée.
ALTER TABLE "patient" ADD CONSTRAINT "patient_notes_chiffre" CHECK ("notes" LIKE 'v1.%');
ALTER TABLE "couverture_amo" ADD CONSTRAINT "couverture_amo_nir_chiffre" CHECK ("nir" LIKE 'v1.%');
ALTER TABLE "couverture_amo" ADD CONSTRAINT "couverture_amo_ald_chiffre" CHECK ("ald" LIKE 'v1.%');

-- Empreinte HMAC-SHA256 en hexadécimal minuscule.
ALTER TABLE "couverture_amo" ADD CONSTRAINT "couverture_amo_nir_empreinte_format" CHECK ("nir_empreinte" ~ '^[0-9a-f]{64}$');

-- Une fiche ne peut pas être fusionnée dans elle-même.
ALTER TABLE "patient" ADD CONSTRAINT "patient_fusion_distincte" CHECK ("fusionne_dans_id" IS NULL OR "fusionne_dans_id" <> "id");
