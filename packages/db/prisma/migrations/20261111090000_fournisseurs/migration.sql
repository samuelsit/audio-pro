-- CreateEnum
CREATE TYPE "TypeFournisseur" AS ENUM ('FABRICANT', 'FOURNISSEUR');

-- AlterTable
ALTER TABLE "accessoire" ADD COLUMN     "fournisseur_id" TEXT;

-- AlterTable
ALTER TABLE "modele_aide_auditive" ADD COLUMN     "prix_achat_centimes" INTEGER;

-- CreateTable
CREATE TABLE "centrale_achat" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centrale_achat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "type" "TypeFournisseur" NOT NULL,
    "nom" TEXT NOT NULL,
    "fabricant_id" TEXT,
    "centrale_achat_id" TEXT,
    "email_commande" TEXT,
    "email_facturation" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "siret" TEXT,
    "conditions" TEXT,
    "delai_relance_jours" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur_contact" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "fournisseur_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fonction" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fournisseur_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur_compte_centre" (
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "fournisseur_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "numero_client" TEXT NOT NULL,

    CONSTRAINT "fournisseur_compte_centre_pkey" PRIMARY KEY ("fournisseur_id","centre_id")
);

-- CreateTable
CREATE TABLE "parametres_commande" (
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "delai_relance_jours" INTEGER NOT NULL,
    "relances_max" INTEGER NOT NULL,
    "tolerance_prix_centimes" INTEGER NOT NULL,
    "adresse_boite_factures" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_commande_pkey" PRIMARY KEY ("organisation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centrale_achat_organisation_id_nom_key" ON "centrale_achat"("organisation_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "fournisseur_fabricant_id_key" ON "fournisseur"("fabricant_id");

-- CreateIndex
CREATE INDEX "fournisseur_centrale_achat_id_idx" ON "fournisseur"("centrale_achat_id");

-- CreateIndex
CREATE UNIQUE INDEX "fournisseur_organisation_id_nom_key" ON "fournisseur"("organisation_id", "nom");

-- CreateIndex
CREATE INDEX "fournisseur_contact_fournisseur_id_idx" ON "fournisseur_contact"("fournisseur_id");

-- CreateIndex
CREATE INDEX "fournisseur_compte_centre_centre_id_idx" ON "fournisseur_compte_centre"("centre_id");

-- CreateIndex
CREATE UNIQUE INDEX "fournisseur_compte_centre_fournisseur_id_numero_client_key" ON "fournisseur_compte_centre"("fournisseur_id", "numero_client");

-- CreateIndex
CREATE INDEX "accessoire_fournisseur_id_idx" ON "accessoire"("fournisseur_id");

-- AddForeignKey
ALTER TABLE "accessoire" ADD CONSTRAINT "accessoire_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centrale_achat" ADD CONSTRAINT "centrale_achat_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_fabricant_id_fkey" FOREIGN KEY ("fabricant_id") REFERENCES "fabricant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_centrale_achat_id_fkey" FOREIGN KEY ("centrale_achat_id") REFERENCES "centrale_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_contact" ADD CONSTRAINT "fournisseur_contact_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_contact" ADD CONSTRAINT "fournisseur_contact_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_compte_centre" ADD CONSTRAINT "fournisseur_compte_centre_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_compte_centre" ADD CONSTRAINT "fournisseur_compte_centre_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_compte_centre" ADD CONSTRAINT "fournisseur_compte_centre_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_commande" ADD CONSTRAINT "parametres_commande_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un fabricant commandé porte le lien vers sa fiche de catalogue, un fournisseur n'en a pas.
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_type_fabricant"
  CHECK (("type" = 'FABRICANT') = ("fabricant_id" IS NOT NULL));
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_delai_relance_positif"
  CHECK ("delai_relance_jours" IS NULL OR "delai_relance_jours" >= 1);
ALTER TABLE "parametres_commande" ADD CONSTRAINT "parametres_commande_bornes"
  CHECK ("delai_relance_jours" >= 1 AND "relances_max" >= 0 AND "tolerance_prix_centimes" >= 0);
ALTER TABLE "modele_aide_auditive" ADD CONSTRAINT "modele_prix_achat_positif"
  CHECK ("prix_achat_centimes" IS NULL OR "prix_achat_centimes" >= 0);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['centrale_achat', 'fournisseur', 'fournisseur_contact', 'fournisseur_compte_centre', 'parametres_commande']
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

GRANT SELECT, INSERT, UPDATE ON "centrale_achat", "fournisseur", "parametres_commande" TO ha_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "fournisseur_contact", "fournisseur_compte_centre" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('accessoire', 'fournisseur', 'fournisseur_id'),
      ('fournisseur', 'fabricant', 'fabricant_id'),
      ('fournisseur', 'centrale_achat', 'centrale_achat_id'),
      ('fournisseur_contact', 'fournisseur', 'fournisseur_id'),
      ('fournisseur_compte_centre', 'fournisseur', 'fournisseur_id'),
      ('fournisseur_compte_centre', 'centre', 'centre_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
