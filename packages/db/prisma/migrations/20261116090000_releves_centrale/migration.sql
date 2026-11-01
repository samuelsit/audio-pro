-- CreateEnum
CREATE TYPE "EtatPointageReleve" AS ENUM ('POINTEE', 'MANQUANTE', 'MONTANT_DIFFERENT');

-- CreateTable
CREATE TABLE "releve_centrale" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centrale_achat_id" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "document_cle" TEXT,
    "importe_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releve_centrale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releve_centrale_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "releve_id" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "numero_facture" TEXT NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "date_facture" DATE NOT NULL,
    "montant_ttc_centimes" INTEGER NOT NULL,
    "etat" "EtatPointageReleve" NOT NULL,
    "facture_fournisseur_id" TEXT,

    CONSTRAINT "releve_centrale_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "releve_centrale_organisation_id_idx" ON "releve_centrale"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "releve_centrale_centrale_achat_id_mois_key" ON "releve_centrale"("centrale_achat_id", "mois");

-- CreateIndex
CREATE INDEX "releve_centrale_ligne_facture_fournisseur_id_idx" ON "releve_centrale_ligne"("facture_fournisseur_id");

-- CreateIndex
CREATE UNIQUE INDEX "releve_centrale_ligne_releve_id_rang_key" ON "releve_centrale_ligne"("releve_id", "rang");

-- AddForeignKey
ALTER TABLE "releve_centrale" ADD CONSTRAINT "releve_centrale_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_centrale" ADD CONSTRAINT "releve_centrale_centrale_achat_id_fkey" FOREIGN KEY ("centrale_achat_id") REFERENCES "centrale_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_centrale" ADD CONSTRAINT "releve_centrale_importe_par_id_fkey" FOREIGN KEY ("importe_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_centrale_ligne" ADD CONSTRAINT "releve_centrale_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_centrale_ligne" ADD CONSTRAINT "releve_centrale_ligne_releve_id_fkey" FOREIGN KEY ("releve_id") REFERENCES "releve_centrale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releve_centrale_ligne" ADD CONSTRAINT "releve_centrale_ligne_facture_fournisseur_id_fkey" FOREIGN KEY ("facture_fournisseur_id") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "releve_centrale" ADD CONSTRAINT "releve_centrale_mois" CHECK ("mois" ~ '^\d{4}-(0[1-9]|1[0-2])$');

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['releve_centrale', 'releve_centrale_ligne']
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

GRANT SELECT, INSERT ON "releve_centrale", "releve_centrale_ligne" TO ha_app;
GRANT UPDATE ("etat", "facture_fournisseur_id") ON "releve_centrale_ligne" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('releve_centrale', 'centrale_achat', 'centrale_achat_id'),
      ('releve_centrale', 'utilisateur', 'importe_par_id'),
      ('releve_centrale_ligne', 'releve_centrale', 'releve_id'),
      ('releve_centrale_ligne', 'facture_fournisseur', 'facture_fournisseur_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
