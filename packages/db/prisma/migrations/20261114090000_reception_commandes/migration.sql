-- CreateEnum
CREATE TYPE "TypeEcartAchat" AS ENUM ('QUANTITE_MANQUANTE', 'SURPLUS', 'PRODUIT_NON_CONFORME', 'PRIX', 'QUANTITE_FACTUREE', 'LIGNE_NON_COMMANDEE', 'SERIE_INCONNUE', 'SERIE_ABSENTE', 'SERIE_DEJA_FACTUREE', 'TOTAL_INCOHERENT');

-- CreateEnum
CREATE TYPE "StatutEcartAchat" AS ENUM ('OUVERT', 'ACCEPTE', 'CONTESTE', 'RESOLU');

-- CreateTable
CREATE TABLE "reception" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "commande_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "date_reception" DATE NOT NULL,
    "reference_bon_livraison" TEXT NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "reception_id" TEXT NOT NULL,
    "commande_ligne_id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "quantite_non_conforme" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reception_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_ligne_appareil" (
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "reception_ligne_id" TEXT NOT NULL,
    "appareil_id" TEXT NOT NULL,

    CONSTRAINT "reception_ligne_appareil_pkey" PRIMARY KEY ("reception_ligne_id","appareil_id")
);

-- CreateTable
CREATE TABLE "ecart_achat" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "commande_id" TEXT,
    "commande_ligne_id" TEXT,
    "reception_id" TEXT,
    "type" "TypeEcartAchat" NOT NULL,
    "statut" "StatutEcartAchat" NOT NULL DEFAULT 'OUVERT',
    "quantite_attendue" INTEGER,
    "quantite_constatee" INTEGER,
    "montant_attendu_centimes" INTEGER,
    "montant_constate_centimes" INTEGER,
    "numero_serie" TEXT,
    "commentaire" TEXT,
    "traite_par_id" TEXT,
    "traite_le" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecart_achat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reception_commande_id_idx" ON "reception"("commande_id");

-- CreateIndex
CREATE INDEX "reception_organisation_id_idx" ON "reception"("organisation_id");

-- CreateIndex
CREATE INDEX "reception_ligne_reception_id_idx" ON "reception_ligne"("reception_id");

-- CreateIndex
CREATE INDEX "reception_ligne_commande_ligne_id_idx" ON "reception_ligne"("commande_ligne_id");

-- CreateIndex
CREATE UNIQUE INDEX "reception_ligne_appareil_appareil_id_key" ON "reception_ligne_appareil"("appareil_id");

-- CreateIndex
CREATE INDEX "ecart_achat_centre_id_statut_idx" ON "ecart_achat"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "ecart_achat_commande_id_statut_idx" ON "ecart_achat"("commande_id", "statut");

-- CreateIndex
CREATE INDEX "ecart_achat_organisation_id_statut_idx" ON "ecart_achat"("organisation_id", "statut");

-- AddForeignKey
ALTER TABLE "reception" ADD CONSTRAINT "reception_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception" ADD CONSTRAINT "reception_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception" ADD CONSTRAINT "reception_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception" ADD CONSTRAINT "reception_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_ligne" ADD CONSTRAINT "reception_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_ligne" ADD CONSTRAINT "reception_ligne_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_ligne" ADD CONSTRAINT "reception_ligne_commande_ligne_id_fkey" FOREIGN KEY ("commande_ligne_id") REFERENCES "commande_ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_ligne_appareil" ADD CONSTRAINT "reception_ligne_appareil_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_ligne_appareil" ADD CONSTRAINT "reception_ligne_appareil_reception_ligne_id_fkey" FOREIGN KEY ("reception_ligne_id") REFERENCES "reception_ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_ligne_appareil" ADD CONSTRAINT "reception_ligne_appareil_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_commande_ligne_id_fkey" FOREIGN KEY ("commande_ligne_id") REFERENCES "commande_ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_traite_par_id_fkey" FOREIGN KEY ("traite_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "reception_ligne" ADD CONSTRAINT "reception_ligne_quantites"
  CHECK ("quantite" >= 0 AND "quantite_non_conforme" >= 0 AND "quantite" + "quantite_non_conforme" > 0);
ALTER TABLE "ecart_achat" ADD CONSTRAINT "ecart_achat_commentaire_chiffre"
  CHECK ("commentaire" IS NULL OR "commentaire" LIKE 'v1.%');

-- Une réception ne se corrige pas : elle a créé du stock et des mouvements.
CREATE FUNCTION reception_ajout_seul() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Une réception ne se modifie pas.';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['reception', 'reception_ligne', 'reception_ligne_appareil']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER reception_ajout_seul BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reception_ajout_seul()',
      t
    );
  END LOOP;
  FOREACH t IN ARRAY ARRAY['reception', 'reception_ligne', 'reception_ligne_appareil', 'ecart_achat']
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

GRANT SELECT, INSERT ON "reception", "reception_ligne", "reception_ligne_appareil" TO ha_app;
GRANT SELECT, INSERT, UPDATE ON "ecart_achat" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('reception', 'commande', 'commande_id'),
      ('reception', 'centre', 'centre_id'),
      ('reception', 'utilisateur', 'acteur_id'),
      ('reception_ligne', 'reception', 'reception_id'),
      ('reception_ligne', 'commande_ligne', 'commande_ligne_id'),
      ('reception_ligne_appareil', 'reception_ligne', 'reception_ligne_id'),
      ('reception_ligne_appareil', 'appareil', 'appareil_id'),
      ('ecart_achat', 'centre', 'centre_id'),
      ('ecart_achat', 'commande', 'commande_id'),
      ('ecart_achat', 'commande_ligne', 'commande_ligne_id'),
      ('ecart_achat', 'reception', 'reception_id'),
      ('ecart_achat', 'utilisateur', 'traite_par_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
