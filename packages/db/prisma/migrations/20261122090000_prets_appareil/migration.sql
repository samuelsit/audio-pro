-- CreateTable
CREATE TABLE "pret_appareil" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "appareil_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "ticket_sav_id" TEXT,
    "date_debut" DATE NOT NULL,
    "date_retour_prevue" DATE NOT NULL,
    "date_retour" DATE,
    "etat_retour" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pret_appareil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pret_appareil_centre_id_date_retour_idx" ON "pret_appareil"("centre_id", "date_retour");

-- CreateIndex
CREATE INDEX "pret_appareil_appareil_id_idx" ON "pret_appareil"("appareil_id");

-- CreateIndex
CREATE INDEX "pret_appareil_patient_id_idx" ON "pret_appareil"("patient_id");

-- CreateIndex
CREATE INDEX "pret_appareil_ticket_sav_id_idx" ON "pret_appareil"("ticket_sav_id");

-- AddForeignKey
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_ticket_sav_id_fkey" FOREIGN KEY ("ticket_sav_id") REFERENCES "ticket_sav"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_chiffre"
  CHECK ("etat_retour" IS NULL OR "etat_retour" LIKE 'v1.%');
ALTER TABLE "pret_appareil" ADD CONSTRAINT "pret_appareil_dates"
  CHECK ("date_retour_prevue" >= "date_debut");

-- Un appareil ne se prête pas deux fois.
CREATE UNIQUE INDEX "pret_appareil_en_cours" ON "pret_appareil" ("appareil_id") WHERE "date_retour" IS NULL;

ALTER TABLE "pret_appareil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pret_appareil" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_organisation ON "pret_appareil"
  USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id());
CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON "pret_appareil"
  FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable();
GRANT SELECT, INSERT, UPDATE ON "pret_appareil" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('appareil_id', 'appareil'),
    ('centre_id', 'centre'),
    ('patient_id', 'patient'),
    ('ticket_sav_id', 'ticket_sav'),
    ('created_by_id', 'utilisateur')
  ) AS v(col, ref)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON "pret_appareil" FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.col, r.col, r.ref, r.col
    );
  END LOOP;
END;
$$;
