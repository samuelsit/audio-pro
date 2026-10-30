-- CreateEnum
CREATE TYPE "StatutAppareil" AS ENUM ('EN_STOCK', 'RESERVE', 'EN_ESSAI', 'VENDU', 'RETOUR_FABRICANT', 'SAV', 'PRET');

-- CreateEnum
CREATE TYPE "TypeMouvementAppareil" AS ENUM ('RECEPTION', 'CHANGEMENT_STATUT', 'TRANSFERT', 'ANNULATION_VENTE');

-- CreateEnum
CREATE TYPE "TypeMouvementAccessoire" AS ENUM ('ENTREE', 'SORTIE', 'TRANSFERT_SORTANT', 'TRANSFERT_ENTRANT');

-- CreateTable
CREATE TABLE "appareil" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "modele_id" TEXT NOT NULL,
    "fabricant_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "numero_serie" TEXT NOT NULL,
    "statut" "StatutAppareil" NOT NULL DEFAULT 'EN_STOCK',
    "patient_id" TEXT,
    "date_reception" DATE NOT NULL,
    "reference_bon_livraison" TEXT NOT NULL,
    "reference_facture_fabricant" TEXT,
    "prix_achat_centimes" INTEGER,
    "en_consignation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvement_appareil" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "appareil_id" TEXT NOT NULL,
    "type" "TypeMouvementAppareil" NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateur_id" TEXT NOT NULL,
    "statut_avant" "StatutAppareil",
    "statut_apres" "StatutAppareil" NOT NULL,
    "centre_avant_id" TEXT,
    "centre_apres_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "dossier_id" TEXT,
    "motif" TEXT,

    CONSTRAINT "mouvement_appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_accessoire" (
    "centre_id" TEXT NOT NULL,
    "accessoire_id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_accessoire_pkey" PRIMARY KEY ("centre_id","accessoire_id")
);

-- CreateTable
CREATE TABLE "mouvement_accessoire" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "accessoire_id" TEXT NOT NULL,
    "type" "TypeMouvementAccessoire" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "quantite_apres" INTEGER NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateur_id" TEXT NOT NULL,
    "motif" TEXT NOT NULL,

    CONSTRAINT "mouvement_accessoire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appareil_organisation_id_numero_serie_idx" ON "appareil"("organisation_id", "numero_serie");

-- CreateIndex
CREATE INDEX "appareil_centre_id_statut_idx" ON "appareil"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "appareil_modele_id_idx" ON "appareil"("modele_id");

-- CreateIndex
CREATE INDEX "appareil_patient_id_idx" ON "appareil"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "appareil_fabricant_id_numero_serie_key" ON "appareil"("fabricant_id", "numero_serie");

-- CreateIndex
CREATE INDEX "mouvement_appareil_appareil_id_horodatage_idx" ON "mouvement_appareil"("appareil_id", "horodatage");

-- CreateIndex
CREATE INDEX "mouvement_appareil_patient_id_idx" ON "mouvement_appareil"("patient_id");

-- CreateIndex
CREATE INDEX "stock_accessoire_accessoire_id_idx" ON "stock_accessoire"("accessoire_id");

-- CreateIndex
CREATE INDEX "mouvement_accessoire_centre_id_accessoire_id_horodatage_idx" ON "mouvement_accessoire"("centre_id", "accessoire_id", "horodatage");

-- CreateIndex
CREATE UNIQUE INDEX "modele_aide_auditive_id_fabricant_id_key" ON "modele_aide_auditive"("id", "fabricant_id");

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_modele_id_fabricant_id_fkey" FOREIGN KEY ("modele_id", "fabricant_id") REFERENCES "modele_aide_auditive"("id", "fabricant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_fabricant_id_fkey" FOREIGN KEY ("fabricant_id") REFERENCES "fabricant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_centre_avant_id_fkey" FOREIGN KEY ("centre_avant_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_centre_apres_id_fkey" FOREIGN KEY ("centre_apres_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_accessoire" ADD CONSTRAINT "stock_accessoire_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_accessoire" ADD CONSTRAINT "stock_accessoire_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Valeurs impossibles : un stock ou un prix négatif, une quantité de mouvement nulle.
ALTER TABLE "stock_accessoire" ADD CONSTRAINT "stock_accessoire_quantite_positive" CHECK ("quantite" >= 0);
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_prix_achat_positif" CHECK ("prix_achat_centimes" >= 0);
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_quantite_positive" CHECK ("quantite" > 0);
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_quantite_apres_positive" CHECK ("quantite_apres" >= 0);

-- Champs chiffrés par l'application (ADR-005) : toute valeur écrite en clair par erreur est refusée.
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_motif_chiffre" CHECK ("motif" LIKE 'v1.%');
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_motif_chiffre" CHECK ("motif" LIKE 'v1.%');

-- Historiques en ajout seul : toute modification ou suppression de ligne est refusée.
-- TRUNCATE reste possible (bases jetables de test).
CREATE FUNCTION mouvement_stock_ajout_seul() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% est en ajout seul : % refusé', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mouvement_appareil_ajout_seul
  BEFORE UPDATE OR DELETE ON "mouvement_appareil"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();

CREATE TRIGGER mouvement_accessoire_ajout_seul
  BEFORE UPDATE OR DELETE ON "mouvement_accessoire"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();
