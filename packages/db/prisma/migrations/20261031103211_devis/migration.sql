-- CreateEnum
CREATE TYPE "LieuFabrication" AS ENUM ('UE', 'HORS_UE');

-- CreateEnum
CREATE TYPE "OptionAideAuditive" AS ENUM ('REDUCTEUR_ACOUPHENE', 'CONNECTIVITE_SANS_FIL', 'REDUCTEUR_BRUIT_VENT', 'SYNCHRONISATION_BINAURALE', 'DIRECTIVITE_ADAPTATIVE', 'BANDE_PASSANTE_ELARGIE', 'APPRENTISSAGE_SONIE', 'REDUCTEUR_REVERBERATION');

-- CreateEnum
CREATE TYPE "StatutDevis" AS ENUM ('BROUILLON', 'EMIS', 'SIGNE', 'REMPLACE');

-- CreateEnum
CREATE TYPE "RubriqueOffre" AS ENUM ('OFFRE_100_SANTE', 'AUTRE_OFFRE');

-- CreateEnum
CREATE TYPE "NatureLigneDevis" AS ENUM ('AIDE_AUDITIVE', 'ACCESSOIRE', 'PILE');

-- CreateEnum
CREATE TYPE "ModeSignature" AS ENUM ('SCAN', 'ELECTRONIQUE');

-- AlterTable
ALTER TABLE "accessoire" ADD COLUMN     "marque" TEXT,
ADD COLUMN     "reference_commerciale" TEXT;

-- AlterTable
ALTER TABLE "centre" ADD COLUMN     "raison_sociale" TEXT,
ADD COLUMN     "rcs" TEXT,
ADD COLUMN     "siret" TEXT,
ADD COLUMN     "tva_intracommunautaire" TEXT;

-- AlterTable
ALTER TABLE "fabricant" ADD COLUMN     "adresse" TEXT,
ADD COLUMN     "mandataire" TEXT;

-- AlterTable
ALTER TABLE "modele_aide_auditive" ADD COLUMN     "anti_larsen" BOOLEAN,
ADD COLUMN     "bobine_t" BOOLEAN,
ADD COLUMN     "connectivite" TEXT,
ADD COLUMN     "lieu_fabrication" "LieuFabrication",
ADD COLUMN     "marque" TEXT,
ADD COLUMN     "nombre_canaux" INTEGER,
ADD COLUMN     "options" "OptionAideAuditive"[] DEFAULT ARRAY[]::"OptionAideAuditive"[],
ADD COLUMN     "reducteur_acouphenes" BOOLEAN,
ADD COLUMN     "reference_commerciale" TEXT;

-- CreateTable
CREATE TABLE "compteur_devis" (
    "organisation_id" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "compteur_devis_pkey" PRIMARY KEY ("organisation_id","annee")
);

-- CreateTable
CREATE TABLE "devis" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "dossier_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "statut" "StatutDevis" NOT NULL DEFAULT 'BROUILLON',
    "lieu_emission" TEXT NOT NULL,
    "validite_mois" INTEGER NOT NULL,
    "taux_amo" INTEGER NOT NULL,
    "refus_offre_c2s" BOOLEAN NOT NULL,
    "contrat_responsable" BOOLEAN NOT NULL,
    "bobine_t_presentee" BOOLEAN NOT NULL,
    "fiche_technique_jointe" BOOLEAN NOT NULL,
    "depot_garantie_centimes" INTEGER,
    "date_precedent_droite" DATE,
    "date_precedent_gauche" DATE,
    "date_emission" DATE,
    "date_fin_validite" DATE,
    "pdf_cle" TEXT,
    "pdf_taille" INTEGER,
    "totaux" JSONB,
    "controles" JSONB,
    "offre_essai" "RubriqueOffre",
    "offre_retenue" "RubriqueOffre",
    "scan_signe_cle" TEXT,
    "scan_signe_type" TEXT,
    "scan_signe_taille" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "emis_par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devis_offre" (
    "id" TEXT NOT NULL,
    "devis_id" TEXT NOT NULL,
    "rubrique" "RubriqueOffre" NOT NULL,
    "amc_droite_centimes" INTEGER,
    "amc_gauche_centimes" INTEGER,
    "amc_consommables_centimes" INTEGER,

    CONSTRAINT "devis_offre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devis_ligne" (
    "id" TEXT NOT NULL,
    "offre_id" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "nature" "NatureLigneDevis" NOT NULL,
    "oreille" "Oreille",
    "classe" "ClasseLpp",
    "modele_id" TEXT,
    "accessoire_id" TEXT,
    "quantite" INTEGER NOT NULL,
    "prix_unitaire_avant_remise_centimes" INTEGER NOT NULL,
    "prix_unitaire_centimes" INTEGER NOT NULL,
    "taux_tva" INTEGER NOT NULL,
    "code_lpp" CHAR(7),
    "designation" JSONB NOT NULL,

    CONSTRAINT "devis_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_devis" (
    "id" TEXT NOT NULL,
    "devis_id" TEXT NOT NULL,
    "mode" "ModeSignature" NOT NULL,
    "date_signature" DATE NOT NULL,
    "saisie_par_id" TEXT NOT NULL,
    "scan_cle" TEXT,
    "scan_type" TEXT,
    "scan_taille" INTEGER,
    "preuve" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_devis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devis_pdf_cle_key" ON "devis"("pdf_cle");

-- CreateIndex
CREATE UNIQUE INDEX "devis_scan_signe_cle_key" ON "devis"("scan_signe_cle");

-- CreateIndex
CREATE UNIQUE INDEX "devis_dossier_id_version_key" ON "devis"("dossier_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "devis_organisation_id_numero_version_key" ON "devis"("organisation_id", "numero", "version");

-- CreateIndex
CREATE UNIQUE INDEX "devis_offre_devis_id_rubrique_key" ON "devis_offre"("devis_id", "rubrique");

-- CreateIndex
CREATE INDEX "devis_ligne_modele_id_idx" ON "devis_ligne"("modele_id");

-- CreateIndex
CREATE INDEX "devis_ligne_accessoire_id_idx" ON "devis_ligne"("accessoire_id");

-- CreateIndex
CREATE UNIQUE INDEX "devis_ligne_offre_id_ordre_key" ON "devis_ligne"("offre_id", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "signature_devis_devis_id_key" ON "signature_devis"("devis_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_devis_scan_cle_key" ON "signature_devis"("scan_cle");

-- AddForeignKey
ALTER TABLE "compteur_devis" ADD CONSTRAINT "compteur_devis_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_emis_par_id_fkey" FOREIGN KEY ("emis_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis_offre" ADD CONSTRAINT "devis_offre_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis_ligne" ADD CONSTRAINT "devis_ligne_offre_id_fkey" FOREIGN KEY ("offre_id") REFERENCES "devis_offre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis_ligne" ADD CONSTRAINT "devis_ligne_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_aide_auditive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis_ligne" ADD CONSTRAINT "devis_ligne_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_devis" ADD CONSTRAINT "signature_devis_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_devis" ADD CONSTRAINT "signature_devis_saisie_par_id_fkey" FOREIGN KEY ("saisie_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une version en cours de rédaction, une seule version en vigueur, par dossier.
CREATE UNIQUE INDEX "devis_un_brouillon_par_dossier" ON "devis" ("dossier_id") WHERE "statut" = 'BROUILLON';
CREATE UNIQUE INDEX "devis_une_version_en_vigueur_par_dossier" ON "devis" ("dossier_id") WHERE "statut" IN ('EMIS', 'SIGNE');

ALTER TABLE "devis" ADD CONSTRAINT "devis_version_positive" CHECK ("version" >= 1);
ALTER TABLE "devis" ADD CONSTRAINT "devis_taux_amo_valide" CHECK ("taux_amo" BETWEEN 0 AND 100);
ALTER TABLE "devis" ADD CONSTRAINT "devis_validite_positive" CHECK ("validite_mois" >= 1);
-- Un devis sorti de BROUILLON a toujours sa date, son PDF et son auteur.
ALTER TABLE "devis" ADD CONSTRAINT "devis_emission_complete"
  CHECK ("statut" = 'BROUILLON' OR ("date_emission" IS NOT NULL AND "date_fin_validite" IS NOT NULL AND "pdf_cle" IS NOT NULL AND "emis_par_id" IS NOT NULL));

-- Une aide porte son oreille, sa classe et son modèle ; un consommable, son article.
ALTER TABLE "devis_ligne" ADD CONSTRAINT "devis_ligne_nature_coherente"
  CHECK (CASE WHEN "nature" = 'AIDE_AUDITIVE'
    THEN "oreille" IS NOT NULL AND "classe" IS NOT NULL AND "modele_id" IS NOT NULL AND "accessoire_id" IS NULL AND "quantite" = 1
    ELSE "oreille" IS NULL AND "classe" IS NULL AND "modele_id" IS NULL AND "accessoire_id" IS NOT NULL AND "quantite" >= 1 END);
ALTER TABLE "devis_ligne" ADD CONSTRAINT "devis_ligne_prix_positifs"
  CHECK ("prix_unitaire_centimes" >= 0 AND "prix_unitaire_centimes" <= "prix_unitaire_avant_remise_centimes");
CREATE UNIQUE INDEX "devis_ligne_une_aide_par_oreille" ON "devis_ligne" ("offre_id", "oreille") WHERE "oreille" IS NOT NULL;

-- Le scan est requis pour une signature par scan.
ALTER TABLE "signature_devis" ADD CONSTRAINT "signature_devis_scan_requis"
  CHECK ("mode" <> 'SCAN' OR ("scan_cle" IS NOT NULL AND "scan_type" IS NOT NULL AND "scan_taille" > 0));

CREATE TRIGGER signature_devis_ajout_seul
  BEFORE UPDATE OR DELETE ON "signature_devis"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();

-- Gel d'un devis émis (voir ADR-012) : le contenu ne change plus. Avant signature, seuls le statut,
-- l'offre choisie pour l'essai et le scan déposé évoluent ; à la signature s'ajoute l'offre retenue.
-- Un devis signé ne peut plus que passer à REMPLACE ; un devis remplacé ne change plus.
CREATE FUNCTION devis_fige() RETURNS trigger AS $$
DECLARE
  evolutifs text[] := ARRAY['statut', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."statut" <> 'BROUILLON' THEN
      RAISE EXCEPTION 'devis figé : suppression refusée' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."statut" = 'BROUILLON' THEN
    RETURN NEW;
  END IF;
  IF OLD."statut" = 'REMPLACE' OR (OLD."statut" = 'SIGNE' AND NEW."statut" <> 'REMPLACE') THEN
    IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
      RAISE EXCEPTION 'devis figé : modification refusée' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."statut" = 'EMIS' THEN
    evolutifs := evolutifs || ARRAY['offre_essai', 'offre_retenue', 'scan_signe_cle', 'scan_signe_type', 'scan_signe_taille'];
  END IF;
  IF to_jsonb(NEW) - evolutifs IS DISTINCT FROM to_jsonb(OLD) - evolutifs THEN
    RAISE EXCEPTION 'devis figé : modification refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER devis_gel
  BEFORE UPDATE OR DELETE ON "devis"
  FOR EACH ROW EXECUTE FUNCTION devis_fige();

-- Offres et lignes ne changent que sur un brouillon. Sans devis parent : suppression en cascade d'un brouillon.
CREATE FUNCTION devis_contenu_fige() RETURNS trigger AS $$
DECLARE
  id_offre text;
  id_devis text;
  statut_devis "StatutDevis";
BEGIN
  IF TG_TABLE_NAME = 'devis_ligne' THEN
    id_offre := CASE WHEN TG_OP = 'DELETE' THEN OLD."offre_id" ELSE NEW."offre_id" END;
    SELECT "devis_id" INTO id_devis FROM "devis_offre" WHERE "id" = id_offre;
  ELSE
    id_devis := CASE WHEN TG_OP = 'DELETE' THEN OLD."devis_id" ELSE NEW."devis_id" END;
  END IF;
  SELECT "statut" INTO statut_devis FROM "devis" WHERE "id" = id_devis;
  IF FOUND AND statut_devis <> 'BROUILLON' THEN
    RAISE EXCEPTION 'devis figé : % refusé sur %', TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER devis_offre_gel
  BEFORE INSERT OR UPDATE OR DELETE ON "devis_offre"
  FOR EACH ROW EXECUTE FUNCTION devis_contenu_fige();

CREATE TRIGGER devis_ligne_gel
  BEFORE INSERT OR UPDATE OR DELETE ON "devis_ligne"
  FOR EACH ROW EXECUTE FUNCTION devis_contenu_fige();
