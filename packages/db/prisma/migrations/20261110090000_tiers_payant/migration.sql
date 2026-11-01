-- CreateEnum
CREATE TYPE "ModePec" AS ENUM ('PORTAIL', 'EDI');

-- CreateEnum
CREATE TYPE "TypeCreance" AS ENUM ('AMO', 'AMC');

-- CreateEnum
CREATE TYPE "OrigineReglement" AS ENUM ('MANUEL', 'NOEMIE');

-- CreateEnum
CREATE TYPE "NatureRegularisation" AS ENUM ('ECART_PERTE', 'ECART_PROFIT', 'TRANSFERT_PATIENT');

-- CreateEnum
CREATE TYPE "ResolutionRejet" AS ENUM ('REPRESENTEE', 'TRANSFEREE_PATIENT', 'ABANDONNEE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatutPec" ADD VALUE 'A_DEMANDER';
ALTER TYPE "StatutPec" ADD VALUE 'PARTIELLE';
ALTER TYPE "StatutPec" ADD VALUE 'EXPIREE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'REGLEMENT_ORGANISME';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'ANNULATION_REGLEMENT_ORGANISME';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'REGULARISATION_ORGANISME';

-- AlterTable
ALTER TABLE "facture" ADD COLUMN     "tiers_payant_amo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "prise_en_charge" ADD COLUMN     "complementaire_id" TEXT,
ADD COLUMN     "demande" JSONB,
ADD COLUMN     "devis_id" TEXT,
ADD COLUMN     "montant_demande_centimes" INTEGER,
ADD COLUMN     "numero_adherent" TEXT,
ADD COLUMN     "offre" TEXT,
ADD COLUMN     "reference_plateforme" TEXT,
ADD COLUMN     "validite_fin" DATE;

-- CreateTable
CREATE TABLE "complementaire" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "nom" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "plateforme_tiers_payant" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "mode_pec" "ModePec" NOT NULL DEFAULT 'PORTAIL',
    "delai_paiement_jours" INTEGER NOT NULL DEFAULT 30,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complementaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creance" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "facture_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "TypeCreance" NOT NULL,
    "complementaire_id" TEXT,
    "organisme" TEXT NOT NULL,
    "regime" TEXT,
    "numero_accord" TEXT,
    "montant_centimes" INTEGER NOT NULL,
    "solde_centimes" INTEGER NOT NULL,
    "date_emission" DATE NOT NULL,
    "echeance_attendue" DATE NOT NULL,
    "derniere_relance_le" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglement_organisme" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "organisme" TEXT NOT NULL,
    "complementaire_id" TEXT,
    "date_reglement" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "part_amo_centimes" INTEGER NOT NULL,
    "part_amc_centimes" INTEGER NOT NULL,
    "reste_a_lettrer_centimes" INTEGER NOT NULL,
    "origine" "OrigineReglement" NOT NULL DEFAULT 'MANUEL',
    "identifiant_externe" TEXT,
    "origine_id" TEXT,
    "motif" TEXT,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reglement_organisme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lettrage" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "reglement_id" TEXT NOT NULL,
    "creance_id" TEXT NOT NULL,
    "type" "TypeCreance" NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    "origine_id" TEXT,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lettrage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularisation_creance" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "creance_id" TEXT,
    "reglement_id" TEXT,
    "type" "TypeCreance" NOT NULL,
    "nature" "NatureRegularisation" NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "origine_id" TEXT,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regularisation_creance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rejet_creance" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "creance_id" TEXT NOT NULL,
    "date_rejet" DATE NOT NULL,
    "code" TEXT,
    "motif" TEXT NOT NULL,
    "resolution" "ResolutionRejet",
    "resolu_le" TIMESTAMPTZ(3),
    "resolu_par_id" TEXT,
    "saisi_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejet_creance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "complementaire_organisation_id_identifiant_key" ON "complementaire"("organisation_id", "identifiant");

-- CreateIndex
CREATE INDEX "creance_organisation_id_idx" ON "creance"("organisation_id");

-- CreateIndex
CREATE INDEX "creance_centre_id_solde_centimes_idx" ON "creance"("centre_id", "solde_centimes");

-- CreateIndex
CREATE INDEX "creance_centre_id_organisme_idx" ON "creance"("centre_id", "organisme");

-- CreateIndex
CREATE INDEX "creance_patient_id_idx" ON "creance"("patient_id");

-- CreateIndex
CREATE INDEX "creance_complementaire_id_idx" ON "creance"("complementaire_id");

-- CreateIndex
CREATE UNIQUE INDEX "creance_facture_id_type_key" ON "creance"("facture_id", "type");

-- CreateIndex
CREATE INDEX "reglement_organisme_organisation_id_idx" ON "reglement_organisme"("organisation_id");

-- CreateIndex
CREATE INDEX "reglement_organisme_centre_id_reste_a_lettrer_centimes_idx" ON "reglement_organisme"("centre_id", "reste_a_lettrer_centimes");

-- CreateIndex
CREATE INDEX "reglement_organisme_centre_id_organisme_reference_idx" ON "reglement_organisme"("centre_id", "organisme", "reference");

-- CreateIndex
CREATE INDEX "reglement_organisme_complementaire_id_idx" ON "reglement_organisme"("complementaire_id");

-- CreateIndex
CREATE INDEX "reglement_organisme_origine_id_idx" ON "reglement_organisme"("origine_id");

-- CreateIndex
CREATE UNIQUE INDEX "reglement_organisme_centre_id_rang_key" ON "reglement_organisme"("centre_id", "rang");

-- CreateIndex
CREATE UNIQUE INDEX "reglement_organisme_centre_id_identifiant_externe_key" ON "reglement_organisme"("centre_id", "identifiant_externe");

-- CreateIndex
CREATE INDEX "lettrage_organisation_id_idx" ON "lettrage"("organisation_id");

-- CreateIndex
CREATE INDEX "lettrage_reglement_id_idx" ON "lettrage"("reglement_id");

-- CreateIndex
CREATE INDEX "lettrage_creance_id_idx" ON "lettrage"("creance_id");

-- CreateIndex
CREATE INDEX "lettrage_origine_id_idx" ON "lettrage"("origine_id");

-- CreateIndex
CREATE INDEX "regularisation_creance_organisation_id_idx" ON "regularisation_creance"("organisation_id");

-- CreateIndex
CREATE INDEX "regularisation_creance_creance_id_idx" ON "regularisation_creance"("creance_id");

-- CreateIndex
CREATE INDEX "regularisation_creance_reglement_id_idx" ON "regularisation_creance"("reglement_id");

-- CreateIndex
CREATE INDEX "regularisation_creance_origine_id_idx" ON "regularisation_creance"("origine_id");

-- CreateIndex
CREATE UNIQUE INDEX "regularisation_creance_centre_id_rang_key" ON "regularisation_creance"("centre_id", "rang");

-- CreateIndex
CREATE INDEX "rejet_creance_organisation_id_idx" ON "rejet_creance"("organisation_id");

-- CreateIndex
CREATE INDEX "rejet_creance_creance_id_idx" ON "rejet_creance"("creance_id");

-- CreateIndex
CREATE INDEX "rejet_creance_centre_id_resolution_idx" ON "rejet_creance"("centre_id", "resolution");

-- CreateIndex
CREATE INDEX "prise_en_charge_complementaire_id_idx" ON "prise_en_charge"("complementaire_id");

-- CreateIndex
CREATE INDEX "prise_en_charge_devis_id_idx" ON "prise_en_charge"("devis_id");

-- AddForeignKey
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_complementaire_id_fkey" FOREIGN KEY ("complementaire_id") REFERENCES "complementaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complementaire" ADD CONSTRAINT "complementaire_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creance" ADD CONSTRAINT "creance_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creance" ADD CONSTRAINT "creance_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creance" ADD CONSTRAINT "creance_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creance" ADD CONSTRAINT "creance_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creance" ADD CONSTRAINT "creance_complementaire_id_fkey" FOREIGN KEY ("complementaire_id") REFERENCES "complementaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_complementaire_id_fkey" FOREIGN KEY ("complementaire_id") REFERENCES "complementaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_origine_id_fkey" FOREIGN KEY ("origine_id") REFERENCES "reglement_organisme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_reglement_id_fkey" FOREIGN KEY ("reglement_id") REFERENCES "reglement_organisme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_creance_id_fkey" FOREIGN KEY ("creance_id") REFERENCES "creance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_origine_id_fkey" FOREIGN KEY ("origine_id") REFERENCES "lettrage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_creance_id_fkey" FOREIGN KEY ("creance_id") REFERENCES "creance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_reglement_id_fkey" FOREIGN KEY ("reglement_id") REFERENCES "reglement_organisme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_origine_id_fkey" FOREIGN KEY ("origine_id") REFERENCES "regularisation_creance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_creance_id_fkey" FOREIGN KEY ("creance_id") REFERENCES "creance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_saisi_par_id_fkey" FOREIGN KEY ("saisi_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_resolu_par_id_fkey" FOREIGN KEY ("resolu_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ajouté à la main : contraintes, ajout seul, RLS, droits, cohérence des organisations (ADR-030).

-- En texte : une valeur d'enum ajoutée ne s'utilise pas dans sa transaction.
ALTER TABLE "prise_en_charge" DROP CONSTRAINT "prise_en_charge_accord_complet";
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_accord_complet"
  CHECK (("statut"::text IN ('ACCORDEE', 'PARTIELLE')) = ("montant_accorde_centimes" IS NOT NULL)
    AND ("montant_accorde_centimes" IS NULL OR "montant_accorde_centimes" >= 0)
    AND ("statut"::text NOT IN ('ACCORDEE', 'PARTIELLE') OR ("organisme" IS NOT NULL AND "numero_accord" IS NOT NULL)));

-- Sans tiers payant, rien à renseigner ; sinon un organisme, et une date dès que la PEC est demandée.
ALTER TABLE "prise_en_charge" DROP CONSTRAINT "prise_en_charge_organisme";
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_organisme"
  CHECK (("statut"::text = 'SANS_TIERS_PAYANT') = ("organisme" IS NULL)
    AND ("date_pec" IS NULL) = ("statut"::text IN ('SANS_TIERS_PAYANT', 'A_DEMANDER')));

ALTER TABLE "complementaire" ADD CONSTRAINT "complementaire_delai_positif"
  CHECK ("delai_paiement_jours" >= 0);

ALTER TABLE "creance" ADD CONSTRAINT "creance_montant_positif" CHECK ("montant_centimes" > 0);

ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_motif_chiffre"
  CHECK ("motif" IS NULL OR "motif" LIKE 'v1.%');
-- Un règlement est positif et son reste en deçà du montant ; son inverse est négatif et n'a rien à lettrer.
ALTER TABLE "reglement_organisme" ADD CONSTRAINT "reglement_organisme_sens" CHECK (
  ("origine_id" IS NULL AND "part_amo_centimes" >= 0 AND "part_amc_centimes" >= 0
    AND "part_amo_centimes" + "part_amc_centimes" > 0
    AND "reste_a_lettrer_centimes" BETWEEN 0 AND "part_amo_centimes" + "part_amc_centimes")
  OR ("origine_id" IS NOT NULL AND "part_amo_centimes" <= 0 AND "part_amc_centimes" <= 0
    AND "part_amo_centimes" + "part_amc_centimes" < 0
    AND "reste_a_lettrer_centimes" = 0
    AND "motif" IS NOT NULL)
);

ALTER TABLE "lettrage" ADD CONSTRAINT "lettrage_sens" CHECK (
  "montant_centimes" <> 0 AND ("origine_id" IS NULL) = ("montant_centimes" > 0)
);

ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_motif_chiffre"
  CHECK ("motif" LIKE 'v1.%');
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_montant_non_nul"
  CHECK ("montant_centimes" <> 0);
-- Une perte ou un transfert soldent une créance ; un écart en produit classe le reste d'un règlement.
ALTER TABLE "regularisation_creance" ADD CONSTRAINT "regularisation_creance_cible" CHECK (
  ("nature" = 'ECART_PROFIT') = ("creance_id" IS NULL)
  AND ("nature" = 'ECART_PROFIT') = ("reglement_id" IS NOT NULL)
);

ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_motif_chiffre" CHECK ("motif" LIKE 'v1.%');
-- Une résolution a son auteur et sa date.
ALTER TABLE "rejet_creance" ADD CONSTRAINT "rejet_creance_resolution_complete" CHECK (
  ("resolution" IS NULL) = ("resolu_le" IS NULL) AND ("resolution" IS NULL) = ("resolu_par_id" IS NULL)
);

-- Ces tables sont en ajout seul, en plus de leurs droits : une correction est une nouvelle ligne.
CREATE TRIGGER lettrage_ajout_seul BEFORE UPDATE OR DELETE ON "lettrage"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();
CREATE TRIGGER regularisation_creance_ajout_seul BEFORE UPDATE OR DELETE ON "regularisation_creance"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();

-- Seul le reste à lettrer évolue : tout le reste est chaîné.
CREATE FUNCTION reglement_organisme_fige() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reglement_organisme : ajout seul' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (to_jsonb(NEW) - 'reste_a_lettrer_centimes') IS DISTINCT FROM (to_jsonb(OLD) - 'reste_a_lettrer_centimes') THEN
    RAISE EXCEPTION 'reglement_organisme : ajout seul' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reglement_organisme_fige BEFORE UPDATE OR DELETE ON "reglement_organisme"
  FOR EACH ROW EXECUTE FUNCTION reglement_organisme_fige();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['complementaire', 'creance', 'reglement_organisme', 'lettrage', 'regularisation_creance', 'rejet_creance']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_organisation ON %I USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id())',
      t
    );
    EXECUTE format(
      'CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON %I FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable()',
      t
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON "complementaire", "rejet_creance" TO ha_app;
GRANT SELECT, INSERT ON "lettrage", "regularisation_creance" TO ha_app;
GRANT SELECT, INSERT ON "creance", "reglement_organisme" TO ha_app;
GRANT UPDATE ("solde_centimes", "echeance_attendue", "derniere_relance_le") ON "creance" TO ha_app;
GRANT UPDATE ("reste_a_lettrer_centimes") ON "reglement_organisme" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('prise_en_charge', 'complementaire', 'complementaire_id'),
      ('prise_en_charge', 'devis', 'devis_id'),
      ('creance', 'centre', 'centre_id'),
      ('creance', 'facture', 'facture_id'),
      ('creance', 'patient', 'patient_id'),
      ('creance', 'complementaire', 'complementaire_id'),
      ('reglement_organisme', 'centre', 'centre_id'),
      ('reglement_organisme', 'complementaire', 'complementaire_id'),
      ('reglement_organisme', 'reglement_organisme', 'origine_id'),
      ('reglement_organisme', 'utilisateur', 'acteur_id'),
      ('lettrage', 'centre', 'centre_id'),
      ('lettrage', 'reglement_organisme', 'reglement_id'),
      ('lettrage', 'creance', 'creance_id'),
      ('lettrage', 'lettrage', 'origine_id'),
      ('lettrage', 'utilisateur', 'acteur_id'),
      ('regularisation_creance', 'centre', 'centre_id'),
      ('regularisation_creance', 'creance', 'creance_id'),
      ('regularisation_creance', 'reglement_organisme', 'reglement_id'),
      ('regularisation_creance', 'regularisation_creance', 'origine_id'),
      ('regularisation_creance', 'utilisateur', 'acteur_id'),
      ('rejet_creance', 'centre', 'centre_id'),
      ('rejet_creance', 'creance', 'creance_id'),
      ('rejet_creance', 'utilisateur', 'saisi_par_id'),
      ('rejet_creance', 'utilisateur', 'resolu_par_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
