-- `facture_preparee` devient `facture` (ADR-028). Le renommage garde la RLS, les droits et les triggers.

-- CreateEnum
CREATE TYPE "NaturePiece" AS ENUM ('FACTURE', 'AVOIR');
CREATE TYPE "StatutFacture" AS ENUM ('BROUILLON', 'VALIDEE', 'ABANDONNEE');
CREATE TYPE "NatureLigneFacture" AS ENUM ('AIDE_AUDITIVE', 'ACCESSOIRE', 'PILE', 'ENTRETIEN');
CREATE TYPE "TypeEvenementCaisse" AS ENUM ('FACTURE_VALIDEE', 'AVOIR_VALIDE', 'ORIGINAL_EMIS', 'DUPLICATA_EMIS', 'FACTURE_ENVOYEE');
CREATE TYPE "StatutFse" AS ENUM ('EN_ATTENTE', 'TRANSMISE', 'ACCEPTEE', 'REJETEE');

-- AlterEnum
ALTER TYPE "CibleLienDocument" ADD VALUE 'FACTURE';

-- Évolution de la table
ALTER TABLE "facture_preparee" RENAME TO "facture";
ALTER TABLE "facture" RENAME CONSTRAINT "facture_preparee_pkey" TO "facture_pkey";
ALTER TABLE "facture" RENAME CONSTRAINT "facture_preparee_organisation_id_fkey" TO "facture_organisation_id_fkey";
ALTER TABLE "facture" RENAME CONSTRAINT "facture_preparee_dossier_id_fkey" TO "facture_dossier_id_fkey";
ALTER TABLE "facture" RENAME CONSTRAINT "facture_preparee_created_by_id_fkey" TO "facture_created_by_id_fkey";
ALTER TABLE "facture" RENAME CONSTRAINT "facture_preparee_amo_confirmee_par_id_fkey" TO "facture_amo_confirmee_par_id_fkey";
ALTER TABLE "facture" RENAME CONSTRAINT "facture_preparee_confirmation_complete" TO "facture_confirmation_complete";
DROP INDEX "facture_preparee_dossier_id_key";

ALTER TABLE "facture" RENAME COLUMN "date_delivrance" TO "date_facture";
ALTER TABLE "facture" ALTER COLUMN "date_facture" DROP NOT NULL;
ALTER TABLE "facture" ALTER COLUMN "dossier_id" DROP NOT NULL;
ALTER TABLE "facture"
  ADD COLUMN "centre_id" TEXT,
  ADD COLUMN "patient_id" TEXT,
  ADD COLUMN "nature" "NaturePiece" NOT NULL DEFAULT 'FACTURE',
  ADD COLUMN "statut" "StatutFacture" NOT NULL DEFAULT 'BROUILLON',
  ADD COLUMN "numero_sequence" INTEGER,
  ADD COLUMN "numero" TEXT,
  ADD COLUMN "facture_origine_id" TEXT,
  ADD COLUMN "prescription_id" TEXT,
  ADD COLUMN "motif" TEXT,
  ADD COLUMN "taux_amo" INTEGER,
  ADD COLUMN "total_ttc_centimes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_ht_centimes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_tva_centimes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_amo_centimes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_amc_centimes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_reste_centimes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vendeur" JSONB,
  ADD COLUMN "client" JSONB,
  ADD COLUMN "pdf_cle" TEXT,
  ADD COLUMN "validee_le" TIMESTAMPTZ(3),
  ADD COLUMN "validee_par_id" TEXT,
  ADD COLUMN "empreinte" CHAR(64);

-- Reprise : une préparation ouverte devient un brouillon, calculé au jour courant. Un dossier sorti de la
-- file n'a jamais été facturé ici : sa ligne s'abandonne, sans numéro, et garde sa date.
UPDATE "facture" f
SET "centre_id" = d."centre_id",
    "patient_id" = d."patient_id",
    "statut" = (CASE WHEN d."statut" = 'A_FACTURER' THEN 'BROUILLON' ELSE 'ABANDONNEE' END)::"StatutFacture",
    "date_facture" = CASE WHEN d."statut" = 'A_FACTURER' THEN NULL ELSE f."date_facture" END
FROM "dossier" d
WHERE d."id" = f."dossier_id";

ALTER TABLE "facture" ALTER COLUMN "centre_id" SET NOT NULL;
ALTER TABLE "facture" ALTER COLUMN "patient_id" SET NOT NULL;

-- Un seul brouillon par dossier. La double validation est gardée par la transition du dossier.
CREATE UNIQUE INDEX "facture_un_brouillon_par_dossier" ON "facture" ("dossier_id")
  WHERE "statut" = 'BROUILLON' AND "nature" = 'FACTURE';

-- CreateIndex
CREATE UNIQUE INDEX "facture_centre_id_numero_sequence_key" ON "facture"("centre_id", "numero_sequence");
CREATE UNIQUE INDEX "facture_pdf_cle_key" ON "facture"("pdf_cle");
CREATE INDEX "facture_organisation_id_idx" ON "facture"("organisation_id");
CREATE INDEX "facture_centre_id_created_at_idx" ON "facture"("centre_id", "created_at");
CREATE INDEX "facture_patient_id_idx" ON "facture"("patient_id");
CREATE INDEX "facture_dossier_id_idx" ON "facture"("dossier_id");
CREATE INDEX "facture_facture_origine_id_idx" ON "facture"("facture_origine_id");

-- AddForeignKey
ALTER TABLE "facture" ADD CONSTRAINT "facture_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_facture_origine_id_fkey" FOREIGN KEY ("facture_origine_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_validee_par_id_fkey" FOREIGN KEY ("validee_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une pièce validée porte son numéro, sa date, ses instantanés et son empreinte ; un brouillon, rien de cela.
ALTER TABLE "facture" ADD CONSTRAINT "facture_validation_complete" CHECK (
  ("statut" = 'VALIDEE') = ("numero" IS NOT NULL)
  AND ("statut" = 'VALIDEE') = ("numero_sequence" IS NOT NULL)
  AND ("statut" = 'VALIDEE') = ("empreinte" IS NOT NULL)
  AND ("statut" = 'VALIDEE') = ("validee_le" IS NOT NULL)
  AND ("statut" = 'VALIDEE') = ("validee_par_id" IS NOT NULL)
  AND ("statut" = 'VALIDEE') = ("vendeur" IS NOT NULL)
  AND ("statut" = 'VALIDEE') = ("client" IS NOT NULL)
  AND ("statut" <> 'VALIDEE' OR "date_facture" IS NOT NULL)
  AND ("statut" <> 'BROUILLON' OR "date_facture" IS NULL)
);
-- Un avoir reprend une facture et porte son motif, chiffré. Une vente directe n'a pas de dossier, un avoir suit celui de sa facture.
ALTER TABLE "facture" ADD CONSTRAINT "facture_avoir_complet" CHECK (
  ("nature" = 'AVOIR') = ("facture_origine_id" IS NOT NULL)
  AND ("nature" = 'AVOIR') = ("motif" IS NOT NULL)
);
ALTER TABLE "facture" ADD CONSTRAINT "facture_motif_chiffre" CHECK ("motif" IS NULL OR "motif" LIKE 'v1.%');
ALTER TABLE "facture" ADD CONSTRAINT "facture_totaux_positifs" CHECK (
  "total_ttc_centimes" >= 0 AND "total_ht_centimes" >= 0 AND "total_tva_centimes" >= 0
  AND "total_amo_centimes" >= 0 AND "total_amc_centimes" >= 0 AND "total_reste_centimes" >= 0
);

-- CreateTable
CREATE TABLE "ligne_facture" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "facture_id" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "nature" "NatureLigneFacture" NOT NULL,
    "oreille" "Oreille",
    "classe" "ClasseLpp",
    "libelle" TEXT NOT NULL,
    "code_lpp" TEXT,
    "code_lpp_generique" BOOLEAN NOT NULL DEFAULT false,
    "code_prestation" TEXT,
    "numero_serie" TEXT,
    "appareil_id" TEXT,
    "accessoire_id" TEXT,
    "quantite" INTEGER NOT NULL,
    "prix_unitaire_centimes" INTEGER NOT NULL,
    "prix_ttc_centimes" INTEGER NOT NULL DEFAULT 0,
    "taux_tva" INTEGER,
    "montant_ht_centimes" INTEGER NOT NULL DEFAULT 0,
    "montant_tva_centimes" INTEGER NOT NULL DEFAULT 0,
    "base_remboursement_centimes" INTEGER NOT NULL DEFAULT 0,
    "amo_centimes" INTEGER NOT NULL DEFAULT 0,
    "amc_centimes" INTEGER NOT NULL DEFAULT 0,
    "reste_a_charge_centimes" INTEGER NOT NULL DEFAULT 0,
    "ligne_origine_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligne_facture_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ligne_facture_quantite_positive" CHECK ("quantite" > 0),
    CONSTRAINT "ligne_facture_montants_positifs" CHECK (
      "prix_unitaire_centimes" >= 0 AND "prix_ttc_centimes" >= 0 AND "montant_ht_centimes" >= 0
      AND "montant_tva_centimes" >= 0 AND "base_remboursement_centimes" >= 0 AND "amo_centimes" >= 0
      AND "amc_centimes" >= 0 AND "reste_a_charge_centimes" >= 0
    )
);

CREATE TABLE "serie_facture" (
    "centre_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "prefixe" TEXT NOT NULL DEFAULT 'FA',
    "dernier_numero" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serie_facture_pkey" PRIMARY KEY ("centre_id")
);

CREATE TABLE "chaine_caisse" (
    "centre_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "dernier_rang" INTEGER NOT NULL DEFAULT 0,
    "derniere_empreinte" CHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chaine_caisse_pkey" PRIMARY KEY ("centre_id")
);

CREATE TABLE "evenement_caisse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "type" "TypeEvenementCaisse" NOT NULL,
    "facture_id" TEXT,
    "charge" JSONB NOT NULL,
    "empreinte_precedente" CHAR(64) NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_caisse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "facture_id" TEXT NOT NULL,
    "statut" "StatutFse" NOT NULL DEFAULT 'EN_ATTENTE',
    "reference" TEXT,
    "motif" TEXT,
    "contenu" TEXT NOT NULL,
    "soumise_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fse_contenu_chiffre" CHECK ("contenu" LIKE 'v1.%')
);

CREATE TABLE "taux_tva" (
    "id" TEXT NOT NULL,
    "type" "NatureLigneFacture" NOT NULL,
    "taux" INTEGER NOT NULL,
    "debut" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taux_tva_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "taux_tva_borne" CHECK ("taux" BETWEEN 0 AND 10000)
);

-- CreateIndex
CREATE UNIQUE INDEX "ligne_facture_facture_id_rang_key" ON "ligne_facture"("facture_id", "rang");
CREATE INDEX "ligne_facture_organisation_id_idx" ON "ligne_facture"("organisation_id");
CREATE INDEX "ligne_facture_ligne_origine_id_idx" ON "ligne_facture"("ligne_origine_id");
CREATE INDEX "serie_facture_organisation_id_idx" ON "serie_facture"("organisation_id");
CREATE INDEX "chaine_caisse_organisation_id_idx" ON "chaine_caisse"("organisation_id");
CREATE UNIQUE INDEX "evenement_caisse_centre_id_rang_key" ON "evenement_caisse"("centre_id", "rang");
CREATE INDEX "evenement_caisse_organisation_id_idx" ON "evenement_caisse"("organisation_id");
CREATE INDEX "evenement_caisse_facture_id_idx" ON "evenement_caisse"("facture_id");
CREATE UNIQUE INDEX "fse_facture_id_key" ON "fse"("facture_id");
CREATE INDEX "fse_organisation_id_idx" ON "fse"("organisation_id");
CREATE UNIQUE INDEX "taux_tva_type_debut_key" ON "taux_tva"("type", "debut");

-- AddForeignKey
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_ligne_origine_id_fkey" FOREIGN KEY ("ligne_origine_id") REFERENCES "ligne_facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serie_facture" ADD CONSTRAINT "serie_facture_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serie_facture" ADD CONSTRAINT "serie_facture_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chaine_caisse" ADD CONSTRAINT "chaine_caisse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chaine_caisse" ADD CONSTRAINT "chaine_caisse_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evenement_caisse" ADD CONSTRAINT "evenement_caisse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evenement_caisse" ADD CONSTRAINT "evenement_caisse_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evenement_caisse" ADD CONSTRAINT "evenement_caisse_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evenement_caisse" ADD CONSTRAINT "evenement_caisse_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fse" ADD CONSTRAINT "fse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fse" ADD CONSTRAINT "fse_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fse" ADD CONSTRAINT "fse_soumise_par_id_fkey" FOREIGN KEY ("soumise_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une délivrance se rattache à sa facture et s'annule par un avoir total, sans disparaître.
ALTER TABLE "delivrance"
  ADD COLUMN "facture_id" TEXT,
  ADD COLUMN "annulee_le" TIMESTAMPTZ(3),
  ADD COLUMN "avoir_id" TEXT;
ALTER TABLE "delivrance" ADD CONSTRAINT "delivrance_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivrance" ADD CONSTRAINT "delivrance_avoir_id_fkey" FOREIGN KEY ("avoir_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivrance" ADD CONSTRAINT "delivrance_annulation_complete"
  CHECK (("annulee_le" IS NULL) = ("avoir_id" IS NULL));
CREATE INDEX "delivrance_facture_id_idx" ON "delivrance"("facture_id");
CREATE UNIQUE INDEX "delivrance_active_par_oreille" ON "delivrance" ("dossier_id", "oreille")
  WHERE "dossier_id" IS NOT NULL AND "annulee_le" IS NULL;

-- Un lien de document se rattache au patient : la facture d'une vente directe n'a pas de dossier.
ALTER TABLE "lien_document" ALTER COLUMN "dossier_id" DROP NOT NULL;
ALTER TABLE "lien_document" ADD COLUMN "patient_id" TEXT, ADD COLUMN "facture_id" TEXT;
UPDATE "lien_document" l SET "patient_id" = d."patient_id" FROM "dossier" d WHERE d."id" = l."dossier_id";
ALTER TABLE "lien_document" ALTER COLUMN "patient_id" SET NOT NULL;
ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "lien_document_patient_id_idx" ON "lien_document"("patient_id");
CREATE INDEX "lien_document_facture_id_idx" ON "lien_document"("facture_id");
-- En texte : une valeur d'enum ajoutée ne s'utilise pas dans sa transaction.
ALTER TABLE "lien_document" ADD CONSTRAINT "lien_document_facture_ou_dossier" CHECK (
  ("cible"::text = 'FACTURE') = ("facture_id" IS NOT NULL)
  AND ("cible"::text = 'FACTURE' OR "dossier_id" IS NOT NULL)
);
DROP TRIGGER "lien_document_heriter_organisation" ON "lien_document";
CREATE TRIGGER "lien_document_heriter_organisation" BEFORE INSERT ON "lien_document"
  FOR EACH ROW WHEN (NEW."dossier_id" IS NOT NULL)
  EXECUTE FUNCTION heriter_organisation('dossier', 'dossier_id');
CREATE TRIGGER "lien_document_heriter_organisation_patient" BEFORE INSERT ON "lien_document"
  FOR EACH ROW WHEN (NEW."dossier_id" IS NULL)
  EXECUTE FUNCTION heriter_organisation('patient', 'patient_id');

-- Une pièce validée ou abandonnée ne change plus, sauf la pose de son PDF. Rien ne se supprime.
CREATE FUNCTION facture_figee() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'facture : suppression refusée' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.statut <> 'BROUILLON' AND (
    (to_jsonb(NEW) - 'pdf_cle' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'pdf_cle' - 'updated_at')
    OR (OLD.pdf_cle IS NOT NULL AND NEW.pdf_cle IS DISTINCT FROM OLD.pdf_cle)
  ) THEN
    RAISE EXCEPTION 'facture figée : modification refusée' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facture_figee
  BEFORE UPDATE OR DELETE ON "facture"
  FOR EACH ROW EXECUTE FUNCTION facture_figee();

CREATE FUNCTION ligne_facture_figee() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "facture"
    WHERE id = COALESCE(NEW.facture_id, OLD.facture_id) AND statut <> 'BROUILLON'
  ) THEN
    RAISE EXCEPTION 'facture figée : modification refusée' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ligne_facture_figee
  BEFORE INSERT OR UPDATE OR DELETE ON "ligne_facture"
  FOR EACH ROW EXECUTE FUNCTION ligne_facture_figee();

-- Le journal de caisse est en ajout seul, en plus de ses droits.
CREATE FUNCTION evenement_caisse_ajout_seul() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal de caisse : ajout seul' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evenement_caisse_ajout_seul
  BEFORE UPDATE OR DELETE ON "evenement_caisse"
  FOR EACH ROW EXECUTE FUNCTION evenement_caisse_ajout_seul();

CREATE TRIGGER "ligne_facture_heriter_organisation" BEFORE INSERT ON "ligne_facture"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('facture', 'facture_id');
CREATE TRIGGER "fse_heriter_organisation" BEFORE INSERT ON "fse"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('facture', 'facture_id');

-- Une facture validée ne se supprime pas : le droit est retiré en plus du trigger.
REVOKE DELETE ON "facture" FROM ha_app;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ligne_facture', 'serie_facture', 'chaine_caisse', 'evenement_caisse', 'fse']
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "ligne_facture" TO ha_app;
GRANT SELECT, INSERT, UPDATE ON "serie_facture", "chaine_caisse", "fse" TO ha_app;
GRANT SELECT, INSERT ON "evenement_caisse" TO ha_app;
GRANT SELECT ON "taux_tva" TO ha_app;
GRANT SELECT, INSERT ON "taux_tva" TO ha_plateforme;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('facture', 'centre', 'centre_id'),
      ('facture', 'patient', 'patient_id'),
      ('facture', 'prescription', 'prescription_id'),
      ('facture', 'facture', 'facture_origine_id'),
      ('facture', 'utilisateur', 'validee_par_id'),
      ('ligne_facture', 'facture', 'facture_id'),
      ('ligne_facture', 'appareil', 'appareil_id'),
      ('ligne_facture', 'accessoire', 'accessoire_id'),
      ('ligne_facture', 'ligne_facture', 'ligne_origine_id'),
      ('serie_facture', 'centre', 'centre_id'),
      ('chaine_caisse', 'centre', 'centre_id'),
      ('evenement_caisse', 'centre', 'centre_id'),
      ('evenement_caisse', 'facture', 'facture_id'),
      ('evenement_caisse', 'utilisateur', 'acteur_id'),
      ('fse', 'facture', 'facture_id'),
      ('fse', 'utilisateur', 'soumise_par_id'),
      ('delivrance', 'facture', 'facture_id'),
      ('delivrance', 'facture', 'avoir_id'),
      ('lien_document', 'patient', 'patient_id'),
      ('lien_document', 'facture', 'facture_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;

-- Valeurs de R18, marquées À VÉRIFIER : l'expert-comptable les confirmera, un changement ajoutera une ligne.
-- Aucun taux pour l'entretien : R18 n'en fixe pas, à saisir dans la console avant toute ligne d'entretien.
INSERT INTO "taux_tva" ("id", "type", "taux", "debut") VALUES
  (gen_random_uuid()::text, 'AIDE_AUDITIVE', 550, DATE '2021-01-01'),
  (gen_random_uuid()::text, 'ACCESSOIRE', 2000, DATE '2021-01-01'),
  (gen_random_uuid()::text, 'PILE', 2000, DATE '2021-01-01');
