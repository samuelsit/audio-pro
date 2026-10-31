-- Chaque table métier porte organisation_id (ADR-016), rempli depuis le parent.
-- La valeur par défaut évite de la passer dans les créations imbriquées ; le trigger d'héritage la remplace
-- par celle du parent, lu à travers la RLS : un parent d'un autre client donne NULL, refusé par NOT NULL.
CREATE FUNCTION app_organisation_id() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.organisation_id', true), '') $$;

CREATE FUNCTION heriter_organisation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('SELECT organisation_id FROM %I WHERE id = ($1).%I', TG_ARGV[0], TG_ARGV[1])
    INTO NEW.organisation_id USING NEW;
  RETURN NEW;
END;
$$;

ALTER TABLE "utilisateur_centre" ADD COLUMN "organisation_id" TEXT;
UPDATE "utilisateur_centre" e SET "organisation_id" = p."organisation_id" FROM "utilisateur" p WHERE p."id" = e."utilisateur_id";
ALTER TABLE "utilisateur_centre"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "utilisateur_centre" ADD CONSTRAINT "utilisateur_centre_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "utilisateur_centre_organisation_id_idx" ON "utilisateur_centre"("organisation_id");
CREATE TRIGGER "utilisateur_centre_heriter_organisation" BEFORE INSERT ON "utilisateur_centre"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('utilisateur', 'utilisateur_id');

ALTER TABLE "praticien" ADD COLUMN "organisation_id" TEXT;
UPDATE "praticien" e SET "organisation_id" = p."organisation_id" FROM "utilisateur" p WHERE p."id" = e."utilisateur_id";
ALTER TABLE "praticien"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "praticien" ADD CONSTRAINT "praticien_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "praticien_organisation_id_idx" ON "praticien"("organisation_id");
CREATE TRIGGER "praticien_heriter_organisation" BEFORE INSERT ON "praticien"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('utilisateur', 'utilisateur_id');

ALTER TABLE "praticien_centre" ADD COLUMN "organisation_id" TEXT;
UPDATE "praticien_centre" e SET "organisation_id" = p."organisation_id" FROM "praticien" p WHERE p."id" = e."praticien_id";
ALTER TABLE "praticien_centre"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "praticien_centre" ADD CONSTRAINT "praticien_centre_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "praticien_centre_organisation_id_idx" ON "praticien_centre"("organisation_id");
CREATE TRIGGER "praticien_centre_heriter_organisation" BEFORE INSERT ON "praticien_centre"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('praticien', 'praticien_id');

ALTER TABLE "couverture_amo" ADD COLUMN "organisation_id" TEXT;
UPDATE "couverture_amo" e SET "organisation_id" = p."organisation_id" FROM "patient" p WHERE p."id" = e."patient_id";
ALTER TABLE "couverture_amo"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "couverture_amo" ADD CONSTRAINT "couverture_amo_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "couverture_amo_organisation_id_idx" ON "couverture_amo"("organisation_id");
CREATE TRIGGER "couverture_amo_heriter_organisation" BEFORE INSERT ON "couverture_amo"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('patient', 'patient_id');

ALTER TABLE "couverture_amc" ADD COLUMN "organisation_id" TEXT;
UPDATE "couverture_amc" e SET "organisation_id" = p."organisation_id" FROM "patient" p WHERE p."id" = e."patient_id";
ALTER TABLE "couverture_amc"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "couverture_amc" ADD CONSTRAINT "couverture_amc_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "couverture_amc_organisation_id_idx" ON "couverture_amc"("organisation_id");
CREATE TRIGGER "couverture_amc_heriter_organisation" BEFORE INSERT ON "couverture_amc"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('patient', 'patient_id');

ALTER TABLE "modele_code_lpp" ADD COLUMN "organisation_id" TEXT;
UPDATE "modele_code_lpp" e SET "organisation_id" = p."organisation_id" FROM "modele_aide_auditive" p WHERE p."id" = e."modele_id";
ALTER TABLE "modele_code_lpp"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "modele_code_lpp" ADD CONSTRAINT "modele_code_lpp_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "modele_code_lpp_organisation_id_idx" ON "modele_code_lpp"("organisation_id");
CREATE TRIGGER "modele_code_lpp_heriter_organisation" BEFORE INSERT ON "modele_code_lpp"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('modele_aide_auditive', 'modele_id');

ALTER TABLE "stock_accessoire" ADD COLUMN "organisation_id" TEXT;
UPDATE "stock_accessoire" e SET "organisation_id" = p."organisation_id" FROM "accessoire" p WHERE p."id" = e."accessoire_id";
ALTER TABLE "stock_accessoire"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "stock_accessoire" ADD CONSTRAINT "stock_accessoire_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "stock_accessoire_organisation_id_idx" ON "stock_accessoire"("organisation_id");
CREATE TRIGGER "stock_accessoire_heriter_organisation" BEFORE INSERT ON "stock_accessoire"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('accessoire', 'accessoire_id');

ALTER TABLE "transition_dossier" ADD COLUMN "organisation_id" TEXT;
ALTER TABLE "transition_dossier" DISABLE TRIGGER "transition_dossier_ajout_seul";
UPDATE "transition_dossier" e SET "organisation_id" = p."organisation_id" FROM "dossier" p WHERE p."id" = e."dossier_id";
ALTER TABLE "transition_dossier" ENABLE TRIGGER "transition_dossier_ajout_seul";
ALTER TABLE "transition_dossier"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "transition_dossier" ADD CONSTRAINT "transition_dossier_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "transition_dossier_organisation_id_idx" ON "transition_dossier"("organisation_id");
CREATE TRIGGER "transition_dossier_heriter_organisation" BEFORE INSERT ON "transition_dossier"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('dossier', 'dossier_id');

ALTER TABLE "prescription" ADD COLUMN "organisation_id" TEXT;
ALTER TABLE "prescription" DISABLE TRIGGER "prescription_ajout_seul";
UPDATE "prescription" e SET "organisation_id" = p."organisation_id" FROM "dossier" p WHERE p."id" = e."dossier_id";
ALTER TABLE "prescription" ENABLE TRIGGER "prescription_ajout_seul";
ALTER TABLE "prescription"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "prescription_organisation_id_idx" ON "prescription"("organisation_id");
CREATE TRIGGER "prescription_heriter_organisation" BEFORE INSERT ON "prescription"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('dossier', 'dossier_id');

ALTER TABLE "prise_en_charge" ADD COLUMN "organisation_id" TEXT;
UPDATE "prise_en_charge" e SET "organisation_id" = p."organisation_id" FROM "dossier" p WHERE p."id" = e."dossier_id";
ALTER TABLE "prise_en_charge"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "prise_en_charge" ADD CONSTRAINT "prise_en_charge_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "prise_en_charge_organisation_id_idx" ON "prise_en_charge"("organisation_id");
CREATE TRIGGER "prise_en_charge_heriter_organisation" BEFORE INSERT ON "prise_en_charge"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('dossier', 'dossier_id');

ALTER TABLE "devis_offre" ADD COLUMN "organisation_id" TEXT;
ALTER TABLE "devis_offre" DISABLE TRIGGER "devis_offre_gel";
UPDATE "devis_offre" e SET "organisation_id" = p."organisation_id" FROM "devis" p WHERE p."id" = e."devis_id";
ALTER TABLE "devis_offre" ENABLE TRIGGER "devis_offre_gel";
ALTER TABLE "devis_offre"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "devis_offre" ADD CONSTRAINT "devis_offre_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "devis_offre_organisation_id_idx" ON "devis_offre"("organisation_id");
CREATE TRIGGER "devis_offre_heriter_organisation" BEFORE INSERT ON "devis_offre"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('devis', 'devis_id');

ALTER TABLE "devis_ligne" ADD COLUMN "organisation_id" TEXT;
ALTER TABLE "devis_ligne" DISABLE TRIGGER "devis_ligne_gel";
UPDATE "devis_ligne" e SET "organisation_id" = p."organisation_id" FROM "devis_offre" p WHERE p."id" = e."offre_id";
ALTER TABLE "devis_ligne" ENABLE TRIGGER "devis_ligne_gel";
ALTER TABLE "devis_ligne"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "devis_ligne" ADD CONSTRAINT "devis_ligne_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "devis_ligne_organisation_id_idx" ON "devis_ligne"("organisation_id");
CREATE TRIGGER "devis_ligne_heriter_organisation" BEFORE INSERT ON "devis_ligne"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('devis_offre', 'offre_id');

ALTER TABLE "signature_devis" ADD COLUMN "organisation_id" TEXT;
ALTER TABLE "signature_devis" DISABLE TRIGGER "signature_devis_ajout_seul";
UPDATE "signature_devis" e SET "organisation_id" = p."organisation_id" FROM "devis" p WHERE p."id" = e."devis_id";
ALTER TABLE "signature_devis" ENABLE TRIGGER "signature_devis_ajout_seul";
ALTER TABLE "signature_devis"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "signature_devis" ADD CONSTRAINT "signature_devis_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "signature_devis_organisation_id_idx" ON "signature_devis"("organisation_id");
CREATE TRIGGER "signature_devis_heriter_organisation" BEFORE INSERT ON "signature_devis"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('devis', 'devis_id');

ALTER TABLE "essai_appareil" ADD COLUMN "organisation_id" TEXT;
UPDATE "essai_appareil" e SET "organisation_id" = p."organisation_id" FROM "essai" p WHERE p."id" = e."essai_id";
ALTER TABLE "essai_appareil"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "essai_appareil" ADD CONSTRAINT "essai_appareil_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "essai_appareil_organisation_id_idx" ON "essai_appareil"("organisation_id");
CREATE TRIGGER "essai_appareil_heriter_organisation" BEFORE INSERT ON "essai_appareil"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('essai', 'essai_id');

ALTER TABLE "essai_rdv" ADD COLUMN "organisation_id" TEXT;
ALTER TABLE "essai_rdv" DISABLE TRIGGER "essai_rdv_ajout_seul";
UPDATE "essai_rdv" e SET "organisation_id" = p."organisation_id" FROM "essai" p WHERE p."id" = e."essai_id";
ALTER TABLE "essai_rdv" ENABLE TRIGGER "essai_rdv_ajout_seul";
ALTER TABLE "essai_rdv"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "essai_rdv" ADD CONSTRAINT "essai_rdv_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "essai_rdv_organisation_id_idx" ON "essai_rdv"("organisation_id");
CREATE TRIGGER "essai_rdv_heriter_organisation" BEFORE INSERT ON "essai_rdv"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('essai', 'essai_id');

ALTER TABLE "prolongation_essai" ADD COLUMN "organisation_id" TEXT;
UPDATE "prolongation_essai" e SET "organisation_id" = p."organisation_id" FROM "essai" p WHERE p."id" = e."essai_id";
ALTER TABLE "prolongation_essai"
  ALTER COLUMN "organisation_id" SET NOT NULL,
  ALTER COLUMN "organisation_id" SET DEFAULT app_organisation_id();
ALTER TABLE "prolongation_essai" ADD CONSTRAINT "prolongation_essai_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "prolongation_essai_organisation_id_idx" ON "prolongation_essai"("organisation_id");
CREATE TRIGGER "prolongation_essai_heriter_organisation" BEFORE INSERT ON "prolongation_essai"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('essai', 'essai_id');

-- Un même RPPS peut exercer chez deux clients.
DROP INDEX "praticien_rpps_key";
DROP INDEX "praticien_adeli_key";
CREATE UNIQUE INDEX "praticien_organisation_id_rpps_key" ON "praticien"("organisation_id", "rpps");
CREATE UNIQUE INDEX "praticien_organisation_id_adeli_key" ON "praticien"("organisation_id", "adeli");
