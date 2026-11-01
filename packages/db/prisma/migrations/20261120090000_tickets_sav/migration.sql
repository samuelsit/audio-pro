-- CreateEnum
CREATE TYPE "MotifSav" AS ENUM ('PANNE', 'CASSE', 'PERTE', 'VOL', 'ENTRETIEN', 'AUTRE');

-- CreateEnum
CREATE TYPE "ActionSav" AS ENUM ('REPARATION_CENTRE', 'ENVOI_FABRICANT', 'ECHANGE');

-- CreateEnum
CREATE TYPE "StatutTicketSav" AS ENUM ('OUVERT', 'EN_COURS', 'CHEZ_FABRICANT', 'A_RESTITUER', 'CLOTURE', 'ANNULE');

-- CreateEnum
CREATE TYPE "CouvertureSav" AS ENUM ('GARANTIE', 'ASSURANCE', 'AUCUNE');

-- AlterTable
ALTER TABLE "mouvement_appareil" ADD COLUMN     "ticket_sav_id" TEXT;

-- CreateTable
CREATE TABLE "compteur_sav" (
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "nature" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "compteur_sav_pkey" PRIMARY KEY ("organisation_id","nature","annee")
);

-- CreateTable
CREATE TABLE "ticket_sav" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "numero" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "appareil_id" TEXT NOT NULL,
    "appareil_remplacant_id" TEXT,
    "motif" "MotifSav" NOT NULL,
    "description" TEXT,
    "diagnostic" TEXT,
    "action" "ActionSav",
    "statut" "StatutTicketSav" NOT NULL DEFAULT 'OUVERT',
    "couverture" "CouvertureSav" NOT NULL,
    "cout_centimes" INTEGER,
    "facture_id" TEXT,
    "motif_facturation" TEXT,
    "motif_annulation" TEXT,
    "date_ouverture" DATE NOT NULL,
    "date_diagnostic" DATE,
    "date_reparation" DATE,
    "date_cloture" DATE,
    "ouvert_par_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_sav_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_sav_centre_id_statut_idx" ON "ticket_sav"("centre_id", "statut");

-- CreateIndex
CREATE INDEX "ticket_sav_appareil_id_idx" ON "ticket_sav"("appareil_id");

-- CreateIndex
CREATE INDEX "ticket_sav_appareil_remplacant_id_idx" ON "ticket_sav"("appareil_remplacant_id");

-- CreateIndex
CREATE INDEX "ticket_sav_patient_id_idx" ON "ticket_sav"("patient_id");

-- CreateIndex
CREATE INDEX "ticket_sav_facture_id_idx" ON "ticket_sav"("facture_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_sav_organisation_id_numero_key" ON "ticket_sav"("organisation_id", "numero");

-- CreateIndex
CREATE INDEX "mouvement_appareil_ticket_sav_id_idx" ON "mouvement_appareil"("ticket_sav_id");

-- AddForeignKey
ALTER TABLE "compteur_sav" ADD CONSTRAINT "compteur_sav_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_appareil_remplacant_id_fkey" FOREIGN KEY ("appareil_remplacant_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_ouvert_par_id_fkey" FOREIGN KEY ("ouvert_par_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_appareil" ADD CONSTRAINT "mouvement_appareil_ticket_sav_id_fkey" FOREIGN KEY ("ticket_sav_id") REFERENCES "ticket_sav"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Textes libres, chiffrés par l'application.
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_chiffre" CHECK (
  ("description" IS NULL OR "description" LIKE 'v1.%')
  AND ("diagnostic" IS NULL OR "diagnostic" LIKE 'v1.%')
  AND ("motif_facturation" IS NULL OR "motif_facturation" LIKE 'v1.%')
  AND ("motif_annulation" IS NULL OR "motif_annulation" LIKE 'v1.%')
);
ALTER TABLE "ticket_sav" ADD CONSTRAINT "ticket_sav_cout" CHECK ("cout_centimes" IS NULL OR "cout_centimes" >= 0);

-- Au plus un ticket ouvert par appareil : un SAV en attente pilote l'appareil.
CREATE UNIQUE INDEX "ticket_sav_appareil_ouvert" ON "ticket_sav" ("appareil_id")
  WHERE "statut" NOT IN ('CLOTURE', 'ANNULE');

-- Isolation par client (ADR-016, ADR-019).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['compteur_sav', 'ticket_sav']
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

GRANT SELECT, INSERT, UPDATE ON "compteur_sav", "ticket_sav" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('ticket_sav', 'centre_id', 'centre'),
    ('ticket_sav', 'patient_id', 'patient'),
    ('ticket_sav', 'appareil_id', 'appareil'),
    ('ticket_sav', 'appareil_remplacant_id', 'appareil'),
    ('ticket_sav', 'facture_id', 'facture'),
    ('ticket_sav', 'ouvert_par_id', 'utilisateur'),
    ('mouvement_appareil', 'ticket_sav_id', 'ticket_sav')
  ) AS v(tab, col, ref)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.col, r.col, r.tab, r.ref, r.col
    );
  END LOOP;
END;
$$;
