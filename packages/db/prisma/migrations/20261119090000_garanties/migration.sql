-- CreateTable
CREATE TABLE "garantie_appareil" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "appareil_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "origine_id" TEXT,
    "assureur" TEXT,
    "contrat" TEXT,
    "assurance_fin" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garantie_appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametres_sav" (
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "duree_garantie_mois" INTEGER NOT NULL,
    "suivi_mois" INTEGER[],
    "suivi_par_an" INTEGER NOT NULL,
    "pret_duree_jours" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_sav_pkey" PRIMARY KEY ("organisation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "garantie_appareil_appareil_id_key" ON "garantie_appareil"("appareil_id");

-- CreateIndex
CREATE UNIQUE INDEX "garantie_appareil_origine_id_key" ON "garantie_appareil"("origine_id");

-- CreateIndex
CREATE INDEX "garantie_appareil_patient_id_idx" ON "garantie_appareil"("patient_id");

-- CreateIndex
CREATE INDEX "garantie_appareil_organisation_id_date_fin_idx" ON "garantie_appareil"("organisation_id", "date_fin");

-- AddForeignKey
ALTER TABLE "garantie_appareil" ADD CONSTRAINT "garantie_appareil_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantie_appareil" ADD CONSTRAINT "garantie_appareil_appareil_id_fkey" FOREIGN KEY ("appareil_id") REFERENCES "appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantie_appareil" ADD CONSTRAINT "garantie_appareil_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantie_appareil" ADD CONSTRAINT "garantie_appareil_origine_id_fkey" FOREIGN KEY ("origine_id") REFERENCES "garantie_appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_sav" ADD CONSTRAINT "parametres_sav_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bornes : la garantie ne descend pas sous les 4 ans du modèle de devis (p. 2 § 4).
ALTER TABLE "parametres_sav" ADD CONSTRAINT "parametres_sav_bornes"
  CHECK ("duree_garantie_mois" >= 48 AND "suivi_par_an" >= 0 AND "pret_duree_jours" >= 1);
ALTER TABLE "garantie_appareil" ADD CONSTRAINT "garantie_appareil_dates" CHECK ("date_fin" >= "date_debut");
ALTER TABLE "garantie_appareil" ADD CONSTRAINT "garantie_appareil_assurance"
  CHECK (("assureur" IS NULL) = ("assurance_fin" IS NULL));

-- Reprise : les appareils déjà vendus ont leur garantie, sur le minimum de 48 mois.
INSERT INTO "garantie_appareil" ("id", "organisation_id", "appareil_id", "patient_id", "date_debut", "date_fin", "updated_at")
SELECT gen_random_uuid()::text, a."organisation_id", a."id", a."patient_id", f."date_facture",
  (f."date_facture" + INTERVAL '48 months')::date, CURRENT_TIMESTAMP
FROM "appareil" a
JOIN "ligne_facture" l ON l."appareil_id" = a."id" AND l."nature" = 'AIDE_AUDITIVE'
JOIN "facture" f ON f."id" = l."facture_id" AND f."statut" = 'VALIDEE' AND f."nature" = 'FACTURE'
WHERE a."patient_id" IS NOT NULL
  AND a."statut" IN ('VENDU', 'SAV', 'RETOUR_FABRICANT')
  AND EXISTS (
    SELECT 1 FROM "delivrance" d WHERE d."facture_id" = f."id" AND d."annulee_le" IS NULL
  )
ON CONFLICT ("appareil_id") DO NOTHING;

-- Isolation par client (ADR-016, ADR-019).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['garantie_appareil', 'parametres_sav']
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "garantie_appareil" TO ha_app;
GRANT SELECT, INSERT, UPDATE ON "parametres_sav" TO ha_app;

CREATE TRIGGER zz_meme_organisation_appareil_id BEFORE INSERT OR UPDATE OF "appareil_id" ON "garantie_appareil"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('appareil', 'appareil_id');
CREATE TRIGGER zz_meme_organisation_patient_id BEFORE INSERT OR UPDATE OF "patient_id" ON "garantie_appareil"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('patient', 'patient_id');
CREATE TRIGGER zz_meme_organisation_origine_id BEFORE INSERT OR UPDATE OF "origine_id" ON "garantie_appareil"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('garantie_appareil', 'origine_id');
