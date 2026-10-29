-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AUDIO', 'ASSISTANT');

-- CreateTable
CREATE TABLE "organisation" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "centre" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse_ligne1" TEXT NOT NULL,
    "adresse_ligne2" TEXT,
    "code_postal" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "finess" TEXT,
    "numero_facturation_am" TEXT,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nom_affiche" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verifie" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "doit_changer_mot_de_passe" BOOLEAN NOT NULL DEFAULT true,
    "deux_facteurs_actif" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur_centre" (
    "utilisateur_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_centre_pkey" PRIMARY KEY ("utilisateur_id","centre_id")
);

-- CreateTable
CREATE TABLE "praticien" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "rpps" CHAR(11) NOT NULL,
    "adeli" CHAR(9),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "praticien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "praticien_centre" (
    "praticien_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "praticien_centre_pkey" PRIMARY KEY ("praticien_id","centre_id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "utilisateur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compte" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "mot_de_passe_hash" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deux_facteurs" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "codes_secours" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "verifie" BOOLEAN NOT NULL DEFAULT true,
    "echecs_verification" INTEGER NOT NULL DEFAULT 0,
    "bloque_jusqu_a" TIMESTAMP(3),

    CONSTRAINT "deux_facteurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limitation_debit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "derniere_requete" BIGINT NOT NULL,

    CONSTRAINT "limitation_debit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centre_finess_key" ON "centre"("finess");

-- CreateIndex
CREATE UNIQUE INDEX "centre_numero_facturation_am_key" ON "centre"("numero_facturation_am");

-- CreateIndex
CREATE UNIQUE INDEX "centre_organisation_id_nom_key" ON "centre"("organisation_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE INDEX "utilisateur_organisation_id_idx" ON "utilisateur"("organisation_id");

-- CreateIndex
CREATE INDEX "utilisateur_centre_centre_id_idx" ON "utilisateur_centre"("centre_id");

-- CreateIndex
CREATE UNIQUE INDEX "praticien_utilisateur_id_key" ON "praticien"("utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "praticien_rpps_key" ON "praticien"("rpps");

-- CreateIndex
CREATE UNIQUE INDEX "praticien_adeli_key" ON "praticien"("adeli");

-- CreateIndex
CREATE INDEX "praticien_centre_centre_id_idx" ON "praticien_centre"("centre_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_utilisateur_id_idx" ON "session"("utilisateur_id");

-- CreateIndex
CREATE INDEX "compte_utilisateur_id_idx" ON "compte"("utilisateur_id");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "deux_facteurs_secret_idx" ON "deux_facteurs"("secret");

-- CreateIndex
CREATE INDEX "deux_facteurs_utilisateur_id_idx" ON "deux_facteurs"("utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "limitation_debit_key_key" ON "limitation_debit"("key");

-- AddForeignKey
ALTER TABLE "centre" ADD CONSTRAINT "centre_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur_centre" ADD CONSTRAINT "utilisateur_centre_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur_centre" ADD CONSTRAINT "utilisateur_centre_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "praticien" ADD CONSTRAINT "praticien_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "praticien_centre" ADD CONSTRAINT "praticien_centre_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "praticien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "praticien_centre" ADD CONSTRAINT "praticien_centre_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compte" ADD CONSTRAINT "compte_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deux_facteurs" ADD CONSTRAINT "deux_facteurs_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
