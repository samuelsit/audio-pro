-- Agenda (ADR-020). Une première : les tables naissent ici avec leur isolation, au lieu de la recevoir d'une
-- boucle sur le catalogue. Les boucles des migrations précédentes échoueraient sur les tables existantes.

-- Égalité sur TEXT dans un index GiST, pour les contraintes d'exclusion de `rendez_vous`.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "TypeExceptionAgenda" AS ENUM ('DISPONIBILITE', 'INDISPONIBILITE', 'CONGE', 'FERMETURE_CENTRE');

-- CreateEnum
CREATE TYPE "StatutRdv" AS ENUM ('PLANIFIE', 'CONFIRME', 'ARRIVE', 'VU', 'ABSENT', 'ANNULE');

-- CreateEnum
CREATE TYPE "OrigineRdv" AS ENUM ('INTERNE', 'EN_LIGNE', 'TELEPHONE');

-- AlterTable
ALTER TABLE "praticien_centre" ADD COLUMN     "horaires" JSONB;

-- CreateTable
CREATE TABLE "cabine" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "type_rdv" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "duree_minutes" INTEGER NOT NULL,
    "couleur" TEXT NOT NULL,
    "requiere_praticien" BOOLEAN NOT NULL,
    "requiere_cabine" BOOLEAN NOT NULL,
    "reservable_en_ligne" BOOLEAN NOT NULL DEFAULT false,
    "delai_minimal_minutes" INTEGER NOT NULL DEFAULT 0,
    "nature_essai" "TypeRdvEssai",
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "type_rdv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_agenda" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "type" "TypeExceptionAgenda" NOT NULL,
    "praticien_id" TEXT,
    "cabine_id" TEXT,
    "centre_id" TEXT,
    "debut" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rendez_vous" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "type_rdv_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "prospect_nom" TEXT,
    "prospect_telephone" TEXT,
    "dossier_id" TEXT,
    "praticien_id" TEXT,
    "cabine_id" TEXT,
    "debut" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "statut" "StatutRdv" NOT NULL DEFAULT 'PLANIFIE',
    "origine" "OrigineRdv" NOT NULL,
    "notes" TEXT,
    "arrive_le" TIMESTAMPTZ(3),
    "prise_en_charge_le" TIMESTAMPTZ(3),
    "termine_le" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_domaine" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "type" TEXT NOT NULL,
    "agregat_id" TEXT NOT NULL,
    "charge" JSONB NOT NULL,
    "survenu_le" TIMESTAMPTZ(3) NOT NULL,
    "diffuse_le" TIMESTAMPTZ(3),

    CONSTRAINT "evenement_domaine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cabine_organisation_id_idx" ON "cabine"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "cabine_centre_id_nom_key" ON "cabine"("centre_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "type_rdv_organisation_id_nom_key" ON "type_rdv"("organisation_id", "nom");

-- CreateIndex
CREATE INDEX "exception_agenda_organisation_id_debut_idx" ON "exception_agenda"("organisation_id", "debut");

-- CreateIndex
CREATE INDEX "rendez_vous_centre_id_debut_idx" ON "rendez_vous"("centre_id", "debut");

-- CreateIndex
CREATE INDEX "rendez_vous_patient_id_debut_idx" ON "rendez_vous"("patient_id", "debut");

-- CreateIndex
CREATE INDEX "rendez_vous_dossier_id_idx" ON "rendez_vous"("dossier_id");

-- CreateIndex
CREATE INDEX "rendez_vous_organisation_id_idx" ON "rendez_vous"("organisation_id");

-- CreateIndex
CREATE INDEX "evenement_domaine_organisation_id_idx" ON "evenement_domaine"("organisation_id");

-- AddForeignKey
ALTER TABLE "cabine" ADD CONSTRAINT "cabine_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabine" ADD CONSTRAINT "cabine_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_rdv" ADD CONSTRAINT "type_rdv_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "praticien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_cabine_id_fkey" FOREIGN KEY ("cabine_id") REFERENCES "cabine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_type_rdv_id_fkey" FOREIGN KEY ("type_rdv_id") REFERENCES "type_rdv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "praticien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_cabine_id_fkey" FOREIGN KEY ("cabine_id") REFERENCES "cabine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_domaine" ADD CONSTRAINT "evenement_domaine_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une contrainte d'exclusion, et non un contrôle applicatif : deux réservations simultanées ne se voient pas
-- avant le COMMIT. Bornes `[)` : deux rendez-vous s'enchaînent. `occupeLeCreneau` suit la même liste de statuts.
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_praticien_sans_chevauchement"
  EXCLUDE USING gist ("praticien_id" WITH =, tstzrange("debut", "fin") WITH &&)
  WHERE ("praticien_id" IS NOT NULL AND "statut" NOT IN ('ANNULE', 'ABSENT'));
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_cabine_sans_chevauchement"
  EXCLUDE USING gist ("cabine_id" WITH =, tstzrange("debut", "fin") WITH &&)
  WHERE ("cabine_id" IS NOT NULL AND "statut" NOT IN ('ANNULE', 'ABSENT'));

ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_fin_apres_debut" CHECK ("fin" > "debut");
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_patient_ou_prospect" CHECK (
  ("patient_id" IS NOT NULL AND "prospect_nom" IS NULL AND "prospect_telephone" IS NULL)
  OR ("patient_id" IS NULL AND "prospect_nom" IS NOT NULL AND "prospect_telephone" IS NOT NULL)
);
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_une_ressource" CHECK (
  "praticien_id" IS NOT NULL OR "cabine_id" IS NOT NULL
);
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_dossier_avec_patient" CHECK (
  "dossier_id" IS NULL OR "patient_id" IS NOT NULL
);
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_arrivee_avec_patient" CHECK (
  "statut" NOT IN ('ARRIVE', 'VU') OR "patient_id" IS NOT NULL
);
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_notes_chiffre" CHECK ("notes" LIKE 'v1.%');

ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_fin_apres_debut" CHECK ("fin" > "debut");
ALTER TABLE "exception_agenda" ADD CONSTRAINT "exception_agenda_cibles" CHECK (
  CASE "type"
    WHEN 'DISPONIBILITE' THEN "praticien_id" IS NOT NULL AND "centre_id" IS NOT NULL AND "cabine_id" IS NULL
    WHEN 'CONGE' THEN "praticien_id" IS NOT NULL AND "centre_id" IS NULL AND "cabine_id" IS NULL
    WHEN 'FERMETURE_CENTRE' THEN "centre_id" IS NOT NULL AND "praticien_id" IS NULL AND "cabine_id" IS NULL
    WHEN 'INDISPONIBILITE' THEN ("praticien_id" IS NULL) <> ("cabine_id" IS NULL)
  END
);

ALTER TABLE "type_rdv" ADD CONSTRAINT "type_rdv_duree_positive" CHECK ("duree_minutes" > 0);
ALTER TABLE "type_rdv" ADD CONSTRAINT "type_rdv_une_ressource" CHECK (
  "requiere_praticien" OR "requiere_cabine"
);

-- Le répartiteur ne cherche que ce qui reste à diffuser.
CREATE INDEX "evenement_domaine_a_diffuser" ON "evenement_domaine" ("organisation_id")
  WHERE "diffuse_le" IS NULL;

-- Types proposés aux clients déjà créés, comme TYPES_RDV_DEFAUT du domaine.
INSERT INTO "type_rdv" (
  "id", "organisation_id", "nom", "duree_minutes", "couleur", "requiere_praticien", "requiere_cabine",
  "reservable_en_ligne", "delai_minimal_minutes", "nature_essai", "updated_at"
)
SELECT gen_random_uuid()::text, o."id", t.nom, t.duree, t.couleur, t.praticien, t.cabine, t.en_ligne, t.delai,
  t.nature::"TypeRdvEssai", CURRENT_TIMESTAMP
FROM "organisation" o
CROSS JOIN (VALUES
  ('Bilan', 60, '#2563eb', TRUE, TRUE, TRUE, 1440, NULL),
  ('Appareillage', 60, '#7c3aed', TRUE, TRUE, FALSE, 0, 'POSE'),
  ('Contrôle d’essai', 30, '#0891b2', TRUE, TRUE, FALSE, 0, 'CONTROLE'),
  ('Fin d’essai', 45, '#059669', TRUE, TRUE, FALSE, 0, 'FIN_ESSAI'),
  ('Suivi', 30, '#ca8a04', TRUE, FALSE, TRUE, 1440, NULL),
  ('SAV', 15, '#dc2626', TRUE, FALSE, FALSE, 0, NULL),
  ('Dépistage', 30, '#db2777', FALSE, TRUE, TRUE, 1440, NULL)
) AS t(nom, duree, couleur, praticien, cabine, en_ligne, delai, nature);

-- Héritage de l'organisation depuis le centre (ADR-016).
CREATE TRIGGER "cabine_heriter_organisation" BEFORE INSERT ON "cabine"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('centre', 'centre_id');
CREATE TRIGGER "rendez_vous_heriter_organisation" BEFORE INSERT ON "rendez_vous"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('centre', 'centre_id');

-- Isolation, droits et garde-fous de chaque table (ADR-016, ADR-019).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cabine', 'type_rdv', 'exception_agenda', 'rendez_vous', 'evenement_domaine'] LOOP
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

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('cabine', 'centre', 'centre_id'),
      ('exception_agenda', 'praticien', 'praticien_id'),
      ('exception_agenda', 'cabine', 'cabine_id'),
      ('exception_agenda', 'centre', 'centre_id'),
      ('exception_agenda', 'utilisateur', 'created_by_id'),
      ('rendez_vous', 'centre', 'centre_id'),
      ('rendez_vous', 'type_rdv', 'type_rdv_id'),
      ('rendez_vous', 'patient', 'patient_id'),
      ('rendez_vous', 'dossier', 'dossier_id'),
      ('rendez_vous', 'praticien', 'praticien_id'),
      ('rendez_vous', 'cabine', 'cabine_id'),
      ('rendez_vous', 'utilisateur', 'created_by_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;

-- La console crée les types d'un nouveau client. Le répartiteur de travaux ne lit que l'organisation et
-- l'état de diffusion : jamais la charge.
GRANT SELECT, INSERT ON "type_rdv" TO ha_plateforme;
GRANT SELECT ("organisation_id", "diffuse_le") ON "evenement_domaine" TO ha_plateforme;
