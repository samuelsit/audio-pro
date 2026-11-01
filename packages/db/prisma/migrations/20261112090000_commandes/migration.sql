-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('BROUILLON', 'A_APPROUVER', 'APPROUVEE', 'ENVOYEE', 'PARTIELLEMENT_RECUE', 'RECUE', 'FACTUREE', 'CLOSE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TypeProduitCommande" AS ENUM ('APPAREIL', 'ACCESSOIRE', 'PILE');

-- CreateEnum
CREATE TYPE "DecisionRegleCommande" AS ENUM ('ENVOI_DIRECT', 'APPROBATION');

-- CreateTable
CREATE TABLE "regle_commande" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "libelle" TEXT NOT NULL,
    "priorite" INTEGER NOT NULL,
    "montant_max_centimes" INTEGER,
    "type_produit" "TypeProduitCommande",
    "fournisseur_id" TEXT,
    "centre_id" TEXT,
    "decision" "DecisionRegleCommande" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regle_commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compteur_commande" (
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "compteur_commande_pkey" PRIMARY KEY ("organisation_id","annee")
);

-- CreateTable
CREATE TABLE "commande" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "fournisseur_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "statut" "StatutCommande" NOT NULL DEFAULT 'BROUILLON',
    "demandeur_id" TEXT NOT NULL,
    "regle_id" TEXT,
    "approbateur_id" TEXT,
    "approuvee_le" TIMESTAMPTZ(3),
    "motif_refus" TEXT,
    "motif_annulation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commande_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "commande_id" TEXT NOT NULL,
    "modele_id" TEXT,
    "accessoire_id" TEXT,
    "quantite" INTEGER NOT NULL,
    "prix_achat_centimes" INTEGER,
    "en_consignation" BOOLEAN NOT NULL DEFAULT false,
    "quantite_recue" INTEGER NOT NULL DEFAULT 0,
    "quantite_facturee" INTEGER NOT NULL DEFAULT 0,
    "quantite_abandonnee" INTEGER NOT NULL DEFAULT 0,
    "patient_id" TEXT,
    "reference_patient" TEXT,
    "oreille" "Oreille",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commande_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regle_commande_organisation_id_priorite_idx" ON "regle_commande"("organisation_id", "priorite");

-- CreateIndex
CREATE INDEX "regle_commande_fournisseur_id_idx" ON "regle_commande"("fournisseur_id");

-- CreateIndex
CREATE INDEX "regle_commande_centre_id_idx" ON "regle_commande"("centre_id");

-- CreateIndex
CREATE INDEX "commande_centre_id_statut_idx" ON "commande"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "commande_fournisseur_id_idx" ON "commande"("fournisseur_id");

-- CreateIndex
CREATE INDEX "commande_organisation_id_statut_idx" ON "commande"("organisation_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "commande_organisation_id_numero_key" ON "commande"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "commande_ligne_commande_id_idx" ON "commande_ligne"("commande_id");

-- CreateIndex
CREATE INDEX "commande_ligne_modele_id_idx" ON "commande_ligne"("modele_id");

-- CreateIndex
CREATE INDEX "commande_ligne_accessoire_id_idx" ON "commande_ligne"("accessoire_id");

-- CreateIndex
CREATE INDEX "commande_ligne_patient_id_idx" ON "commande_ligne"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "commande_ligne_organisation_id_reference_patient_key" ON "commande_ligne"("organisation_id", "reference_patient");

-- AddForeignKey
ALTER TABLE "regle_commande" ADD CONSTRAINT "regle_commande_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_commande" ADD CONSTRAINT "regle_commande_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_commande" ADD CONSTRAINT "regle_commande_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compteur_commande" ADD CONSTRAINT "compteur_commande_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_demandeur_id_fkey" FOREIGN KEY ("demandeur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_approbateur_id_fkey" FOREIGN KEY ("approbateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_regle_id_fkey" FOREIGN KEY ("regle_id") REFERENCES "regle_commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_aide_auditive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_accessoire" ADD CONSTRAINT "mouvement_accessoire_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "regle_commande" ADD CONSTRAINT "regle_commande_montant_positif"
  CHECK ("montant_max_centimes" IS NULL OR "montant_max_centimes" >= 0);
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_un_produit"
  CHECK (num_nonnulls("modele_id", "accessoire_id") = 1);
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_quantites"
  CHECK (
    "quantite" > 0 AND "quantite_recue" >= 0 AND "quantite_facturee" >= 0
    AND "quantite_abandonnee" >= 0 AND "quantite_abandonnee" <= "quantite"
    AND ("prix_achat_centimes" IS NULL OR "prix_achat_centimes" >= 0)
  );
-- Une ligne nominative porte son code, et seule une ligne nominative dit l'oreille.
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_nominative"
  CHECK (
    ("patient_id" IS NULL) = ("reference_patient" IS NULL)
    AND ("oreille" IS NULL OR "patient_id" IS NOT NULL)
  );

-- Le contenu d'une commande est figé à l'approbation : le bon envoyé et les rapprochements s'y réfèrent.
CREATE FUNCTION commande_ligne_figee() RETURNS trigger AS $$
DECLARE
  statut_commande "StatutCommande";
BEGIN
  SELECT statut INTO statut_commande FROM commande
    WHERE id = COALESCE(NEW.commande_id, OLD.commande_id);
  IF statut_commande NOT IN ('BROUILLON', 'A_APPROUVER') THEN
    RAISE EXCEPTION 'Ligne de commande figée (statut %).', statut_commande;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commande_ligne_figee
  BEFORE INSERT OR DELETE OR UPDATE OF "commande_id", "modele_id", "accessoire_id", "quantite",
    "prix_achat_centimes", "en_consignation", "patient_id", "reference_patient", "oreille"
  ON "commande_ligne"
  FOR EACH ROW EXECUTE FUNCTION commande_ligne_figee();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['regle_commande', 'compteur_commande', 'commande', 'commande_ligne']
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

GRANT SELECT, INSERT, UPDATE ON "regle_commande", "compteur_commande", "commande" TO ha_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "commande_ligne" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('regle_commande', 'fournisseur', 'fournisseur_id'),
      ('regle_commande', 'centre', 'centre_id'),
      ('commande', 'centre', 'centre_id'),
      ('commande', 'fournisseur', 'fournisseur_id'),
      ('commande', 'utilisateur', 'demandeur_id'),
      ('commande', 'utilisateur', 'approbateur_id'),
      ('commande', 'regle_commande', 'regle_id'),
      ('commande_ligne', 'commande', 'commande_id'),
      ('commande_ligne', 'modele_aide_auditive', 'modele_id'),
      ('commande_ligne', 'accessoire', 'accessoire_id'),
      ('commande_ligne', 'patient', 'patient_id'),
      ('mouvement_appareil', 'commande', 'commande_id'),
      ('mouvement_accessoire', 'commande', 'commande_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
