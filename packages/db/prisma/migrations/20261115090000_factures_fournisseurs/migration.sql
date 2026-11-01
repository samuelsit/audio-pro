-- CreateEnum
CREATE TYPE "StatutFactureFournisseur" AS ENUM ('A_VALIDER', 'VALIDEE', 'REJETEE');

-- CreateEnum
CREATE TYPE "OrigineFactureFournisseur" AS ENUM ('EMAIL', 'DEPOT', 'PLATEFORME');

-- AlterTable
ALTER TABLE "ecart_achat" ADD COLUMN     "facture_fournisseur_id" TEXT;

-- CreateTable
CREATE TABLE "facture_fournisseur" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "statut" "StatutFactureFournisseur" NOT NULL DEFAULT 'A_VALIDER',
    "origine" "OrigineFactureFournisseur" NOT NULL,
    "document_cle" TEXT NOT NULL,
    "document_empreinte" TEXT NOT NULL,
    "identifiant_externe" TEXT,
    "expediteur" TEXT,
    "expediteur_inconnu" BOOLEAN NOT NULL DEFAULT false,
    "fournisseur_id" TEXT,
    "centre_id" TEXT,
    "numero" TEXT,
    "date_facture" DATE,
    "montant_ht_centimes" INTEGER,
    "montant_tva_centimes" INTEGER,
    "montant_ttc_centimes" INTEGER,
    "validateur_id" TEXT,
    "validee_le" TIMESTAMPTZ(3),
    "motif_rejet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facture_fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture_fournisseur_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "facture_id" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "commande_ligne_id" TEXT,
    "reference" TEXT,
    "designation" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prix_unitaire_centimes" INTEGER NOT NULL,
    "taux_tva_points_base" INTEGER,
    "numeros_serie" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "facture_fournisseur_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facture_fournisseur_organisation_id_statut_idx" ON "facture_fournisseur"("organisation_id", "statut");

-- CreateIndex
CREATE INDEX "facture_fournisseur_centre_id_statut_idx" ON "facture_fournisseur"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "facture_fournisseur_fournisseur_id_idx" ON "facture_fournisseur"("fournisseur_id");

-- CreateIndex
CREATE INDEX "facture_fournisseur_ligne_commande_ligne_id_idx" ON "facture_fournisseur_ligne"("commande_ligne_id");

-- CreateIndex
CREATE UNIQUE INDEX "facture_fournisseur_ligne_facture_id_rang_key" ON "facture_fournisseur_ligne"("facture_id", "rang");

-- CreateIndex
CREATE INDEX "ecart_achat_facture_fournisseur_id_idx" ON "ecart_achat"("facture_fournisseur_id");

-- AddForeignKey
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_validateur_id_fkey" FOREIGN KEY ("validateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_fournisseur_ligne" ADD CONSTRAINT "facture_fournisseur_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_fournisseur_ligne" ADD CONSTRAINT "facture_fournisseur_ligne_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facture_fournisseur_ligne" ADD CONSTRAINT "facture_fournisseur_ligne_commande_ligne_id_fkey" FOREIGN KEY ("commande_ligne_id") REFERENCES "commande_ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_facture_fournisseur_id_fkey" FOREIGN KEY ("facture_fournisseur_id") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "facture_fournisseur_document_unique" ON "facture_fournisseur" ("organisation_id", "document_empreinte")
  WHERE "statut" <> 'REJETEE';
CREATE UNIQUE INDEX "facture_fournisseur_identifiant_unique" ON "facture_fournisseur" ("organisation_id", "identifiant_externe")
  WHERE "identifiant_externe" IS NOT NULL AND "statut" <> 'REJETEE';
CREATE UNIQUE INDEX "facture_fournisseur_numero_unique" ON "facture_fournisseur" ("fournisseur_id", "numero")
  WHERE "statut" = 'VALIDEE';

ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_motif_chiffre"
  CHECK ("motif_rejet" IS NULL OR "motif_rejet" LIKE 'v1.%');
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_validee_complete"
  CHECK (
    "statut" <> 'VALIDEE' OR (
      "fournisseur_id" IS NOT NULL AND "centre_id" IS NOT NULL AND "numero" IS NOT NULL
      AND "date_facture" IS NOT NULL AND "montant_ht_centimes" IS NOT NULL
      AND "montant_tva_centimes" IS NOT NULL AND "montant_ttc_centimes" IS NOT NULL
      AND "validateur_id" IS NOT NULL AND "validee_le" IS NOT NULL
    )
  );
ALTER TABLE "facture_fournisseur_ligne" ADD CONSTRAINT "facture_fournisseur_ligne_designation_chiffree"
  CHECK ("designation" LIKE 'v1.%');
ALTER TABLE "facture_fournisseur_ligne" ADD CONSTRAINT "facture_fournisseur_ligne_quantite"
  CHECK ("quantite" <> 0);

-- Une facture validée est une pièce : ni elle ni ses lignes ne changent. Une facture rejetée ne revient pas.
CREATE FUNCTION facture_fournisseur_figee() RETURNS trigger AS $$
BEGIN
  IF OLD.statut <> 'A_VALIDER' THEN
    RAISE EXCEPTION 'Facture fournisseur figée (statut %).', OLD.statut;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facture_fournisseur_figee BEFORE UPDATE OR DELETE ON "facture_fournisseur"
  FOR EACH ROW EXECUTE FUNCTION facture_fournisseur_figee();

CREATE FUNCTION facture_fournisseur_ligne_figee() RETURNS trigger AS $$
DECLARE
  statut_facture "StatutFactureFournisseur";
BEGIN
  SELECT statut INTO statut_facture FROM facture_fournisseur
    WHERE id = COALESCE(NEW.facture_id, OLD.facture_id);
  IF statut_facture <> 'A_VALIDER' THEN
    RAISE EXCEPTION 'Facture fournisseur figée (statut %).', statut_facture;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facture_fournisseur_ligne_figee BEFORE INSERT OR UPDATE OR DELETE ON "facture_fournisseur_ligne"
  FOR EACH ROW EXECUTE FUNCTION facture_fournisseur_ligne_figee();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['facture_fournisseur', 'facture_fournisseur_ligne']
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

GRANT SELECT, INSERT, UPDATE ON "facture_fournisseur" TO ha_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "facture_fournisseur_ligne" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('facture_fournisseur', 'fournisseur', 'fournisseur_id'),
      ('facture_fournisseur', 'centre', 'centre_id'),
      ('facture_fournisseur', 'utilisateur', 'validateur_id'),
      ('facture_fournisseur_ligne', 'facture_fournisseur', 'facture_id'),
      ('facture_fournisseur_ligne', 'commande_ligne', 'commande_ligne_id'),
      ('ecart_achat', 'facture_fournisseur', 'facture_fournisseur_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;

-- La file de la boîte : `ha_plateforme` voit quelles organisations ont une adresse, pas plus.
GRANT SELECT ("organisation_id", "adresse_boite_factures") ON "parametres_commande" TO ha_plateforme;
