-- CreateEnum
CREATE TYPE "SourceMesure" AS ENUM ('SAISIE', 'NOAH');

-- CreateEnum
CREATE TYPE "TypeMesure" AS ENUM ('TONALE', 'VOCALE_CALME', 'VOCALE_BRUIT');

-- CreateEnum
CREATE TYPE "NatureFormulaire" AS ENUM ('ANAMNESE', 'BENEFICE', 'SATISFACTION');

-- CreateTable
CREATE TABLE "bilan_audiologique" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "patient_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "praticien_id" TEXT,
    "date_bilan" DATE NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bilan_audiologique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesure_audiologique" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "bilan_id" TEXT NOT NULL,
    "type" "TypeMesure" NOT NULL,
    "source" "SourceMesure" NOT NULL DEFAULT 'SAISIE',
    "mesure_le" TIMESTAMP(3) NOT NULL,
    "appareil" TEXT,
    "identifiant_externe" TEXT,
    "importe_le" TIMESTAMP(3),
    "donnees" TEXT NOT NULL,
    "version_schema" INTEGER NOT NULL,
    "auteur_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mesure_audiologique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otoscopie" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "bilan_id" TEXT NOT NULL,
    "oreille" "Oreille" NOT NULL,
    "source" "SourceMesure" NOT NULL DEFAULT 'SAISIE',
    "constat" TEXT NOT NULL,
    "photo_cle" TEXT,
    "photo_type" TEXT,
    "photo_taille" INTEGER,
    "auteur_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otoscopie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modele_formulaire" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nature" "NatureFormulaire" NOT NULL,
    "nom" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modele_formulaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reponse_formulaire" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "bilan_id" TEXT NOT NULL,
    "modele_id" TEXT NOT NULL,
    "nature" "NatureFormulaire" NOT NULL,
    "reponses" TEXT NOT NULL,
    "auteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reponse_formulaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bilan_audiologique_patient_id_date_bilan_idx" ON "bilan_audiologique"("patient_id", "date_bilan");

-- CreateIndex
CREATE INDEX "bilan_audiologique_organisation_id_idx" ON "bilan_audiologique"("organisation_id");

-- CreateIndex
CREATE INDEX "bilan_audiologique_centre_id_idx" ON "bilan_audiologique"("centre_id");

-- CreateIndex
CREATE INDEX "mesure_audiologique_bilan_id_idx" ON "mesure_audiologique"("bilan_id");

-- CreateIndex
CREATE INDEX "mesure_audiologique_organisation_id_idx" ON "mesure_audiologique"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "otoscopie_photo_cle_key" ON "otoscopie"("photo_cle");

-- CreateIndex
CREATE INDEX "otoscopie_organisation_id_idx" ON "otoscopie"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "otoscopie_bilan_id_oreille_key" ON "otoscopie"("bilan_id", "oreille");

-- CreateIndex
CREATE INDEX "modele_formulaire_organisation_id_nature_idx" ON "modele_formulaire"("organisation_id", "nature");

-- CreateIndex
CREATE UNIQUE INDEX "modele_formulaire_organisation_id_code_version_key" ON "modele_formulaire"("organisation_id", "code", "version");

-- CreateIndex
CREATE INDEX "reponse_formulaire_organisation_id_idx" ON "reponse_formulaire"("organisation_id");

-- CreateIndex
CREATE INDEX "reponse_formulaire_modele_id_idx" ON "reponse_formulaire"("modele_id");

-- CreateIndex
CREATE UNIQUE INDEX "reponse_formulaire_bilan_id_modele_id_key" ON "reponse_formulaire"("bilan_id", "modele_id");

-- AddForeignKey
ALTER TABLE "bilan_audiologique" ADD CONSTRAINT "bilan_audiologique_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilan_audiologique" ADD CONSTRAINT "bilan_audiologique_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilan_audiologique" ADD CONSTRAINT "bilan_audiologique_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilan_audiologique" ADD CONSTRAINT "bilan_audiologique_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "praticien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilan_audiologique" ADD CONSTRAINT "bilan_audiologique_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesure_audiologique" ADD CONSTRAINT "mesure_audiologique_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesure_audiologique" ADD CONSTRAINT "mesure_audiologique_bilan_id_fkey" FOREIGN KEY ("bilan_id") REFERENCES "bilan_audiologique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesure_audiologique" ADD CONSTRAINT "mesure_audiologique_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otoscopie" ADD CONSTRAINT "otoscopie_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otoscopie" ADD CONSTRAINT "otoscopie_bilan_id_fkey" FOREIGN KEY ("bilan_id") REFERENCES "bilan_audiologique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otoscopie" ADD CONSTRAINT "otoscopie_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_formulaire" ADD CONSTRAINT "modele_formulaire_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_formulaire" ADD CONSTRAINT "modele_formulaire_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_bilan_id_fkey" FOREIGN KEY ("bilan_id") REFERENCES "bilan_audiologique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_formulaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Données de santé chiffrées par l'application (ADR-005, ADR-022).
ALTER TABLE "mesure_audiologique" ADD CONSTRAINT "mesure_audiologique_donnees_chiffrees" CHECK ("donnees" LIKE 'v1.%');
ALTER TABLE "otoscopie" ADD CONSTRAINT "otoscopie_constat_chiffre" CHECK ("constat" LIKE 'v1.%');
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_reponses_chiffrees" CHECK ("reponses" LIKE 'v1.%');

-- Une mesure importée garde son identifiant d'origine ; une mesure saisie n'en a pas (ADR-022).
ALTER TABLE "mesure_audiologique" ADD CONSTRAINT "mesure_audiologique_identifiant_externe" CHECK (
  ("source" = 'NOAH') = ("identifiant_externe" IS NOT NULL)
);
ALTER TABLE "otoscopie" ADD CONSTRAINT "otoscopie_photo_complete" CHECK (
  ("photo_cle" IS NULL) = ("photo_type" IS NULL) AND ("photo_cle" IS NULL) = ("photo_taille" IS NULL)
);
CREATE UNIQUE INDEX "mesure_audiologique_saisie_unique" ON "mesure_audiologique" ("bilan_id", "type")
  WHERE "source" = 'SAISIE';
CREATE UNIQUE INDEX "mesure_audiologique_externe_unique" ON "mesure_audiologique" ("organisation_id", "source", "identifiant_externe")
  WHERE "identifiant_externe" IS NOT NULL;
CREATE UNIQUE INDEX "reponse_formulaire_anamnese_unique" ON "reponse_formulaire" ("bilan_id")
  WHERE "nature" = 'ANAMNESE';

-- Héritage de l'organisation depuis le parent (ADR-016).
CREATE TRIGGER "bilan_audiologique_heriter_organisation" BEFORE INSERT ON "bilan_audiologique"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('centre', 'centre_id');
CREATE TRIGGER "mesure_audiologique_heriter_organisation" BEFORE INSERT ON "mesure_audiologique"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('bilan_audiologique', 'bilan_id');
CREATE TRIGGER "otoscopie_heriter_organisation" BEFORE INSERT ON "otoscopie"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('bilan_audiologique', 'bilan_id');
CREATE TRIGGER "reponse_formulaire_heriter_organisation" BEFORE INSERT ON "reponse_formulaire"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('bilan_audiologique', 'bilan_id');

-- Isolation, droits et garde-fous de chaque table (ADR-016, ADR-019).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilan_audiologique', 'mesure_audiologique', 'otoscopie', 'modele_formulaire', 'reponse_formulaire'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_organisation ON %I USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id())',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ha_app', t);
    EXECUTE format(
      'CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON %I FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable()',
      t
    );
  END LOOP;
END;
$$;

-- Une version de modèle reste lisible telle qu'on y a répondu : seul `actif` change.
REVOKE UPDATE, DELETE ON "modele_formulaire" FROM ha_app;
GRANT UPDATE ("actif") ON "modele_formulaire" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('bilan_audiologique', 'patient', 'patient_id'),
      ('bilan_audiologique', 'centre', 'centre_id'),
      ('bilan_audiologique', 'praticien', 'praticien_id'),
      ('bilan_audiologique', 'utilisateur', 'created_by_id'),
      ('mesure_audiologique', 'bilan_audiologique', 'bilan_id'),
      ('mesure_audiologique', 'utilisateur', 'auteur_id'),
      ('otoscopie', 'bilan_audiologique', 'bilan_id'),
      ('otoscopie', 'utilisateur', 'auteur_id'),
      ('modele_formulaire', 'utilisateur', 'created_by_id'),
      ('reponse_formulaire', 'bilan_audiologique', 'bilan_id'),
      ('reponse_formulaire', 'modele_formulaire', 'modele_id'),
      ('reponse_formulaire', 'utilisateur', 'auteur_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
