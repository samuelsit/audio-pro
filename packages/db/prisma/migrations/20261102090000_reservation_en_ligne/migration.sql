-- Prise de rendez-vous en ligne (ADR-021).

-- Valeur par défaut des slugs : un client ou un centre créé hors des services garde une adresse valide, et
-- illisible, tant qu'on ne lui en donne pas une. Une expression serait réécrite par PostgreSQL et Prisma y verrait
-- une dérive du schéma à chaque migration.
CREATE FUNCTION slug_provisoire() RETURNS TEXT
  LANGUAGE sql
  AS $$ SELECT 'provisoire-' || gen_random_uuid()::text $$;

-- CreateEnum
CREATE TYPE "ValidationReservation" AS ENUM ('AUTOMATIQUE', 'MANUELLE');

-- CreateEnum
CREATE TYPE "StatutReservation" AS ENUM ('VERROU', 'FINALISEE');

-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "GabaritNotification" AS ENUM ('RDV_CONFIRME', 'RDV_DEMANDE_RECUE', 'RDV_ACCEPTE', 'RDV_REFUSE', 'RDV_DEPLACE', 'RDV_ANNULE');

-- CreateEnum
CREATE TYPE "StatutNotification" AS ENUM ('A_ENVOYER', 'ENVOYEE', 'ABANDONNEE');

-- AlterTable
ALTER TABLE "centre" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT slug_provisoire();

-- AlterTable
ALTER TABLE "organisation" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT slug_provisoire();

-- AlterTable
ALTER TABLE "rendez_vous" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "parametres_reservation" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "delai_minimal_minutes" INTEGER NOT NULL,
    "horizon_jours" INTEGER NOT NULL,
    "validation" "ValidationReservation" NOT NULL,
    "delai_modification_heures" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "type_rdv_en_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "type_rdv_id" TEXT NOT NULL,

    CONSTRAINT "type_rdv_en_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_en_ligne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "type_rdv_id" TEXT NOT NULL,
    "praticien_id" TEXT,
    "cabine_id" TEXT,
    "debut" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "statut" "StatutReservation" NOT NULL DEFAULT 'VERROU',
    "expire_le" TIMESTAMPTZ(3) NOT NULL,
    "jeton_empreinte" TEXT NOT NULL,
    "nom" TEXT,
    "prenom" TEXT,
    "date_naissance" DATE,
    "telephone" TEXT,
    "email" TEXT,
    "motif" TEXT,
    "consentement_rgpd_le" TIMESTAMPTZ(3),
    "consentement_sms_le" TIMESTAMPTZ(3),
    "version_consentement" TEXT,
    "code_empreinte" TEXT,
    "code_expire_le" TIMESTAMPTZ(3),
    "code_tentatives" INTEGER NOT NULL DEFAULT 0,
    "code_envois" INTEGER NOT NULL DEFAULT 0,
    "rendez_vous_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_en_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "reservation_id" TEXT NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "destinataire" TEXT NOT NULL,
    "gabarit" "GabaritNotification" NOT NULL,
    "parametres" JSONB NOT NULL,
    "cle_idempotence" TEXT NOT NULL,
    "statut" "StatutNotification" NOT NULL DEFAULT 'A_ENVOYER',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "prochain_essai_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoyee_le" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametres_reservation_centre_id_key" ON "parametres_reservation"("centre_id");

-- CreateIndex
CREATE INDEX "parametres_reservation_organisation_id_idx" ON "parametres_reservation"("organisation_id");

-- CreateIndex
CREATE INDEX "type_rdv_en_ligne_organisation_id_idx" ON "type_rdv_en_ligne"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "type_rdv_en_ligne_centre_id_type_rdv_id_key" ON "type_rdv_en_ligne"("centre_id", "type_rdv_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_en_ligne_jeton_empreinte_key" ON "reservation_en_ligne"("jeton_empreinte");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_en_ligne_rendez_vous_id_key" ON "reservation_en_ligne"("rendez_vous_id");

-- CreateIndex
CREATE INDEX "reservation_en_ligne_organisation_id_statut_expire_le_idx" ON "reservation_en_ligne"("organisation_id", "statut", "expire_le");

-- CreateIndex
CREATE INDEX "reservation_en_ligne_centre_id_debut_idx" ON "reservation_en_ligne"("centre_id", "debut");

-- CreateIndex
CREATE INDEX "notification_reservation_id_idx" ON "notification"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_organisation_id_cle_idempotence_key" ON "notification"("organisation_id", "cle_idempotence");

-- CreateIndex
CREATE UNIQUE INDEX "centre_organisation_id_slug_key" ON "centre"("organisation_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_slug_key" ON "organisation"("slug");

-- AddForeignKey
ALTER TABLE "parametres_reservation" ADD CONSTRAINT "parametres_reservation_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_reservation" ADD CONSTRAINT "parametres_reservation_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_rdv_en_ligne" ADD CONSTRAINT "type_rdv_en_ligne_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_rdv_en_ligne" ADD CONSTRAINT "type_rdv_en_ligne_type_rdv_id_fkey" FOREIGN KEY ("type_rdv_id") REFERENCES "type_rdv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_rdv_en_ligne" ADD CONSTRAINT "type_rdv_en_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_type_rdv_id_fkey" FOREIGN KEY ("type_rdv_id") REFERENCES "type_rdv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_praticien_id_fkey" FOREIGN KEY ("praticien_id") REFERENCES "praticien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_cabine_id_fkey" FOREIGN KEY ("cabine_id") REFERENCES "cabine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservation_en_ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un rendez-vous sans auteur ne peut venir que du patient.
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_auteur_ou_en_ligne" CHECK (
  "created_by_id" IS NOT NULL OR "origine" = 'EN_LIGNE'
);

-- Reprise des clients et centres existants, sur le modèle de `slugDepuisNom` et `slugDisponible` du domaine.
CREATE FUNCTION pg_temp.slug_depuis_nom(nom TEXT, repli TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT COALESCE(NULLIF(btrim(left(regexp_replace(
      lower(replace(replace(translate(nom,
        'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝŸýÿ',
        'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYYyy'),
        'œ', 'oe'), 'Œ', 'OE')),
      '[^a-z0-9]+', '-', 'g'), 60), '-'), ''), repli)
  $$;

DO $$
DECLARE
  o RECORD;
  c RECORD;
  base TEXT;
  candidat TEXT;
  suffixe INT;
BEGIN
  FOR o IN SELECT "id", "raison_sociale" FROM "organisation" ORDER BY "created_at", "id" LOOP
    base := pg_temp.slug_depuis_nom(o."raison_sociale", 'client');
    candidat := base;
    suffixe := 1;
    WHILE candidat = 'lien' OR EXISTS (SELECT 1 FROM "organisation" WHERE "slug" = candidat) LOOP
      suffixe := suffixe + 1;
      candidat := base || '-' || suffixe;
    END LOOP;
    UPDATE "organisation" SET "slug" = candidat WHERE "id" = o."id";
  END LOOP;
  FOR c IN SELECT "id", "organisation_id", "nom" FROM "centre" ORDER BY "created_at", "id" LOOP
    base := pg_temp.slug_depuis_nom(c."nom", 'centre');
    candidat := base;
    suffixe := 1;
    WHILE candidat = 'lien' OR EXISTS (
      SELECT 1 FROM "centre" WHERE "organisation_id" = c."organisation_id" AND "slug" = candidat
    ) LOOP
      suffixe := suffixe + 1;
      candidat := base || '-' || suffixe;
    END LOOP;
    UPDATE "centre" SET "slug" = candidat WHERE "id" = c."id";
  END LOOP;
END;
$$;

-- Le verrou : deux patients ne tiennent pas la même ressource en même temps. Un verrou expiré reste une ligne
-- jusqu'à ce qu'on le supprime, juste avant d'en poser un autre : un prédicat d'exclusion ne peut pas lire l'heure.
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_praticien_sans_chevauchement"
  EXCLUDE USING gist ("praticien_id" WITH =, tstzrange("debut", "fin") WITH &&)
  WHERE ("praticien_id" IS NOT NULL AND "statut" = 'VERROU');
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_cabine_sans_chevauchement"
  EXCLUDE USING gist ("cabine_id" WITH =, tstzrange("debut", "fin") WITH &&)
  WHERE ("cabine_id" IS NOT NULL AND "statut" = 'VERROU');

ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_fin_apres_debut" CHECK ("fin" > "debut");
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_une_ressource" CHECK (
  "praticien_id" IS NOT NULL OR "cabine_id" IS NOT NULL
);
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_motif_chiffre" CHECK ("motif" LIKE 'v1.%');
ALTER TABLE "reservation_en_ligne" ADD CONSTRAINT "reservation_en_ligne_finalisee_avec_rdv" CHECK (
  "statut" <> 'FINALISEE' OR "rendez_vous_id" IS NOT NULL
);

ALTER TABLE "notification" ADD CONSTRAINT "notification_destinataire_chiffre" CHECK ("destinataire" LIKE 'v1.%');

ALTER TABLE "parametres_reservation" ADD CONSTRAINT "parametres_reservation_delais_positifs" CHECK (
  "delai_minimal_minutes" >= 0 AND "horizon_jours" > 0 AND "delai_modification_heures" >= 0
);

-- Le répartiteur ne cherche que ce qui reste à envoyer.
CREATE INDEX "notification_a_envoyer" ON "notification" ("organisation_id", "prochain_essai_le")
  WHERE "statut" = 'A_ENVOYER';

-- Héritage de l'organisation depuis le centre, jamais depuis `rendez_vous_id` : il peut être vide (ADR-016).
CREATE TRIGGER "parametres_reservation_heriter_organisation" BEFORE INSERT ON "parametres_reservation"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('centre', 'centre_id');
CREATE TRIGGER "type_rdv_en_ligne_heriter_organisation" BEFORE INSERT ON "type_rdv_en_ligne"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('centre', 'centre_id');
CREATE TRIGGER "reservation_en_ligne_heriter_organisation" BEFORE INSERT ON "reservation_en_ligne"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('centre', 'centre_id');
CREATE TRIGGER "notification_heriter_organisation" BEFORE INSERT ON "notification"
  FOR EACH ROW EXECUTE FUNCTION heriter_organisation('reservation_en_ligne', 'reservation_id');

-- Isolation, droits et garde-fous de chaque table (ADR-016, ADR-019).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['parametres_reservation', 'type_rdv_en_ligne', 'reservation_en_ligne', 'notification'] LOOP
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
      ('parametres_reservation', 'centre', 'centre_id'),
      ('type_rdv_en_ligne', 'centre', 'centre_id'),
      ('type_rdv_en_ligne', 'type_rdv', 'type_rdv_id'),
      ('reservation_en_ligne', 'centre', 'centre_id'),
      ('reservation_en_ligne', 'type_rdv', 'type_rdv_id'),
      ('reservation_en_ligne', 'praticien', 'praticien_id'),
      ('reservation_en_ligne', 'cabine', 'cabine_id'),
      ('reservation_en_ligne', 'rendez_vous', 'rendez_vous_id'),
      ('notification', 'reservation_en_ligne', 'reservation_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;

-- `ha_plateforme` résout un slug sans contexte client, et voit seulement quoi répartir : jamais un destinataire.
GRANT SELECT ("slug") ON "centre" TO ha_plateforme;
GRANT SELECT ("organisation_id", "statut", "prochain_essai_le") ON "notification" TO ha_plateforme;
