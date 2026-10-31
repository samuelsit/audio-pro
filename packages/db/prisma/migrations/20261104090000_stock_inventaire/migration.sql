-- AlterEnum
ALTER TYPE "TypeMouvementAccessoire" ADD VALUE 'INVENTAIRE_ENTREE';
ALTER TYPE "TypeMouvementAccessoire" ADD VALUE 'INVENTAIRE_SORTIE';

-- CreateEnum
CREATE TYPE "StatutInventaire" AS ENUM ('EN_COURS', 'CLOTURE');

-- AlterTable
ALTER TABLE "accessoire" ADD COLUMN "prix_achat_centimes" INTEGER;

-- AlterTable
ALTER TABLE "mouvement_accessoire" ADD COLUMN "commande_id" TEXT;

-- AlterTable
ALTER TABLE "mouvement_appareil" ADD COLUMN "commande_id" TEXT;

-- CreateTable
CREATE TABLE "inventaire" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "statut" "StatutInventaire" NOT NULL DEFAULT 'EN_COURS',
    "ouvert_par_id" TEXT NOT NULL,
    "cloture_par_id" TEXT,
    "cloture_le" TIMESTAMPTZ(3),
    "valeur_centimes" INTEGER,
    "articles_sans_prix" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventaire_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "inventaire_id" TEXT NOT NULL,
    "numero_serie" TEXT,
    "appareil_id" TEXT,
    "pointe" BOOLEAN NOT NULL DEFAULT false,
    "ecart" BOOLEAN NOT NULL DEFAULT false,
    "accessoire_id" TEXT,
    "quantite_theorique" INTEGER,
    "quantite_comptee" INTEGER,
    "justification" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventaire_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mouvement_appareil_commande_id_idx" ON "mouvement_appareil"("commande_id");

-- CreateIndex
CREATE INDEX "mouvement_accessoire_commande_id_idx" ON "mouvement_accessoire"("commande_id");

-- CreateIndex
CREATE INDEX "inventaire_centre_id_created_at_idx" ON "inventaire"("centre_id", "created_at");

-- CreateIndex
CREATE INDEX "inventaire_organisation_id_idx" ON "inventaire"("organisation_id");

-- CreateIndex
CREATE INDEX "inventaire_ligne_organisation_id_idx" ON "inventaire_ligne"("organisation_id");

-- CreateIndex
CREATE INDEX "inventaire_ligne_appareil_id_idx" ON "inventaire_ligne"("appareil_id");

-- CreateIndex
CREATE INDEX "inventaire_ligne_accessoire_id_idx" ON "inventaire_ligne"("accessoire_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventaire_ligne_inventaire_id_numero_serie_key" ON "inventaire_ligne"("inventaire_id", "numero_serie");

-- CreateIndex
CREATE UNIQUE INDEX "inventaire_ligne_inventaire_id_accessoire_id_key" ON "inventaire_ligne"("inventaire_id", "accessoire_id");

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_ouvert_par_id_fkey" FOREIGN KEY ("ouvert_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_cloture_par_id_fkey" FOREIGN KEY ("cloture_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_inventaire_id_fkey" FOREIGN KEY ("inventaire_id") REFERENCES "inventaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_accessoire_id_fkey" FOREIGN KEY ("accessoire_id") REFERENCES "accessoire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un seul inventaire ouvert par centre : deux pointages parallèles se contrediraient.
CREATE UNIQUE INDEX "inventaire_un_ouvert_par_centre" ON "inventaire"("centre_id") WHERE "statut" = 'EN_COURS';

ALTER TABLE "accessoire" ADD CONSTRAINT "accessoire_prix_achat_positif" CHECK ("prix_achat_centimes" >= 0);
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_cloture_complete" CHECK (
  ("statut" = 'EN_COURS' AND "cloture_par_id" IS NULL AND "cloture_le" IS NULL AND "valeur_centimes" IS NULL AND "articles_sans_prix" IS NULL)
  OR ("statut" = 'CLOTURE' AND "cloture_par_id" IS NOT NULL AND "cloture_le" IS NOT NULL AND "valeur_centimes" IS NOT NULL AND "articles_sans_prix" IS NOT NULL)
);
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_appareil_ou_accessoire" CHECK (
  ("numero_serie" IS NOT NULL AND "accessoire_id" IS NULL AND "quantite_theorique" IS NULL AND "quantite_comptee" IS NULL)
  OR ("numero_serie" IS NULL AND "appareil_id" IS NULL AND NOT "pointe" AND "accessoire_id" IS NOT NULL AND "quantite_theorique" >= 0 AND "quantite_comptee" >= 0)
);
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_justification_chiffre" CHECK ("justification" LIKE 'v1.%');

-- Un inventaire clôturé est une pièce de gestion : ni lui ni ses lignes ne changent.
CREATE FUNCTION inventaire_fige() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.statut = 'CLOTURE' THEN
    RAISE EXCEPTION 'inventaire clôturé : modification refusée' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventaire_fige
  BEFORE UPDATE OR DELETE ON "inventaire"
  FOR EACH ROW EXECUTE FUNCTION inventaire_fige();

CREATE FUNCTION inventaire_ligne_figee() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "inventaire"
    WHERE id = COALESCE(NEW.inventaire_id, OLD.inventaire_id) AND statut = 'CLOTURE'
  ) THEN
    RAISE EXCEPTION 'inventaire clôturé : modification refusée' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventaire_ligne_figee
  BEFORE INSERT OR UPDATE OR DELETE ON "inventaire_ligne"
  FOR EACH ROW EXECUTE FUNCTION inventaire_ligne_figee();

CREATE TRIGGER "inventaire_ligne_heriter_organisation" BEFORE INSERT ON "inventaire_ligne"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('inventaire', 'inventaire_id');

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventaire', 'inventaire_ligne']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_organisation ON %I USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id())',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ha_app', t);
    EXECUTE format(
      'CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON %I FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable()',
      t
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('inventaire', 'centre', 'centre_id'),
      ('inventaire', 'utilisateur', 'ouvert_par_id'),
      ('inventaire', 'utilisateur', 'cloture_par_id'),
      ('inventaire_ligne', 'inventaire', 'inventaire_id'),
      ('inventaire_ligne', 'appareil', 'appareil_id'),
      ('inventaire_ligne', 'accessoire', 'accessoire_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
