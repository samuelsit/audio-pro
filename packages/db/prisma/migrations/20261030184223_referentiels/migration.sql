-- CreateEnum
CREATE TYPE "TypeLienLpp" AS ENUM ('COMPATIBLE', 'INCOMPATIBLE');

-- CreateEnum
CREATE TYPE "TypeAideAuditive" AS ENUM ('CONTOUR', 'INTRA', 'RIC');

-- CreateEnum
CREATE TYPE "ClasseLpp" AS ENUM ('CLASSE_I', 'CLASSE_II');

-- CreateEnum
CREATE TYPE "NatureAccessoire" AS ENUM ('ACCESSOIRE', 'PILE');

-- CreateEnum
CREATE TYPE "SpecialitePrescripteur" AS ENUM ('ORL', 'MEDECIN_GENERALISTE', 'AUTRE');

-- CreateTable
CREATE TABLE "lpp_version" (
    "numero" INTEGER NOT NULL,
    "date_fichiers" DATE NOT NULL,
    "nb_codes" INTEGER NOT NULL,
    "nb_tarifs" INTEGER NOT NULL,
    "nb_compatibilites" INTEGER NOT NULL,
    "nb_incompatibilites" INTEGER NOT NULL,
    "importee_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lpp_version_pkey" PRIMARY KEY ("numero")
);

-- CreateTable
CREATE TABLE "lpp_code" (
    "code" CHAR(7) NOT NULL,
    "derniere_version" INTEGER,

    CONSTRAINT "lpp_code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "lpp_fiche" (
    "version_numero" INTEGER NOT NULL,
    "code" CHAR(7) NOT NULL,
    "libelle" TEXT NOT NULL,
    "date_fin" DATE,
    "age_max" INTEGER,
    "type_prestation" TEXT,
    "indication" TEXT,
    "prothese" TEXT,
    "old_code" TEXT,
    "code_generique" CHAR(7),
    "rmo" TEXT[],
    "arbo" INTEGER[],
    "brut" JSONB NOT NULL,

    CONSTRAINT "lpp_fiche_pkey" PRIMARY KEY ("version_numero","code")
);

-- CreateTable
CREATE TABLE "lpp_tarif" (
    "version_numero" INTEGER NOT NULL,
    "code" CHAR(7) NOT NULL,
    "debut_validite" DATE NOT NULL,
    "fin_validite" DATE,
    "nature_prestation" TEXT NOT NULL,
    "entente" TEXT,
    "date_arrete" DATE,
    "date_jo" DATE,
    "pu_devis" INTEGER,
    "base_remboursement_centimes" INTEGER NOT NULL,
    "prix_limite_vente_centimes" INTEGER,
    "montant_max_centimes" INTEGER,
    "quantite_max" INTEGER,
    "prises_en_charge" TEXT[],
    "majorations_dom" INTEGER[],
    "brut" JSONB NOT NULL,

    CONSTRAINT "lpp_tarif_pkey" PRIMARY KEY ("version_numero","code","debut_validite")
);

-- CreateTable
CREATE TABLE "lpp_lien" (
    "version_numero" INTEGER NOT NULL,
    "type" "TypeLienLpp" NOT NULL,
    "code1" CHAR(7) NOT NULL,
    "code2" CHAR(7) NOT NULL,

    CONSTRAINT "lpp_lien_pkey" PRIMARY KEY ("version_numero","type","code1","code2")
);

-- CreateTable
CREATE TABLE "fabricant" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabricant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modele_aide_auditive" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "fabricant_id" TEXT NOT NULL,
    "gamme" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeAideAuditive" NOT NULL,
    "classe" "ClasseLpp" NOT NULL,
    "prix_conseille_centimes" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modele_aide_auditive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modele_code_lpp" (
    "modele_id" TEXT NOT NULL,
    "code" CHAR(7) NOT NULL,

    CONSTRAINT "modele_code_lpp_pkey" PRIMARY KEY ("modele_id","code")
);

-- CreateTable
CREATE TABLE "accessoire" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nature" "NatureAccessoire" NOT NULL,
    "code_lpp" CHAR(7),
    "prix_centimes" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accessoire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescripteur" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "rpps" CHAR(11),
    "specialite" "SpecialitePrescripteur" NOT NULL,
    "formation_otologie" BOOLEAN,
    "cabinet" TEXT,
    "contact" TEXT,
    "nom_recherche" TEXT NOT NULL,
    "prenom_recherche" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescripteur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lpp_fiche_code_idx" ON "lpp_fiche"("code");

-- CreateIndex
CREATE INDEX "lpp_fiche_version_numero_code_generique_idx" ON "lpp_fiche"("version_numero", "code_generique");

-- CreateIndex
CREATE INDEX "lpp_tarif_code_idx" ON "lpp_tarif"("code");

-- CreateIndex
CREATE INDEX "lpp_lien_code1_idx" ON "lpp_lien"("code1");

-- CreateIndex
CREATE INDEX "lpp_lien_code2_idx" ON "lpp_lien"("code2");

-- CreateIndex
CREATE UNIQUE INDEX "fabricant_organisation_id_nom_key" ON "fabricant"("organisation_id", "nom");

-- CreateIndex
CREATE INDEX "modele_aide_auditive_organisation_id_idx" ON "modele_aide_auditive"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "modele_aide_auditive_fabricant_id_gamme_nom_key" ON "modele_aide_auditive"("fabricant_id", "gamme", "nom");

-- CreateIndex
CREATE INDEX "modele_code_lpp_code_idx" ON "modele_code_lpp"("code");

-- CreateIndex
CREATE INDEX "accessoire_code_lpp_idx" ON "accessoire"("code_lpp");

-- CreateIndex
CREATE UNIQUE INDEX "accessoire_organisation_id_nom_key" ON "accessoire"("organisation_id", "nom");

-- CreateIndex
CREATE INDEX "prescripteur_organisation_id_nom_recherche_idx" ON "prescripteur"("organisation_id", "nom_recherche");

-- CreateIndex
CREATE UNIQUE INDEX "prescripteur_organisation_id_rpps_key" ON "prescripteur"("organisation_id", "rpps");

-- AddForeignKey
ALTER TABLE "lpp_fiche" ADD CONSTRAINT "lpp_fiche_version_numero_fkey" FOREIGN KEY ("version_numero") REFERENCES "lpp_version"("numero") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lpp_fiche" ADD CONSTRAINT "lpp_fiche_code_fkey" FOREIGN KEY ("code") REFERENCES "lpp_code"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lpp_tarif" ADD CONSTRAINT "lpp_tarif_version_numero_fkey" FOREIGN KEY ("version_numero") REFERENCES "lpp_version"("numero") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lpp_tarif" ADD CONSTRAINT "lpp_tarif_code_fkey" FOREIGN KEY ("code") REFERENCES "lpp_code"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lpp_lien" ADD CONSTRAINT "lpp_lien_version_numero_fkey" FOREIGN KEY ("version_numero") REFERENCES "lpp_version"("numero") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabricant" ADD CONSTRAINT "fabricant_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_aide_auditive" ADD CONSTRAINT "modele_aide_auditive_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_aide_auditive" ADD CONSTRAINT "modele_aide_auditive_fabricant_id_fkey" FOREIGN KEY ("fabricant_id") REFERENCES "fabricant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_code_lpp" ADD CONSTRAINT "modele_code_lpp_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_aide_auditive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_code_lpp" ADD CONSTRAINT "modele_code_lpp_code_fkey" FOREIGN KEY ("code") REFERENCES "lpp_code"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessoire" ADD CONSTRAINT "accessoire_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessoire" ADD CONSTRAINT "accessoire_code_lpp_fkey" FOREIGN KEY ("code_lpp") REFERENCES "lpp_code"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescripteur" ADD CONSTRAINT "prescripteur_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
