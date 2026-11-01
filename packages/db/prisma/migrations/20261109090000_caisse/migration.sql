-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('CB', 'ESPECES', 'CHEQUE', 'VIREMENT', 'FINANCEMENT');

-- CreateEnum
CREATE TYPE "NatureMouvement" AS ENUM ('ENCAISSEMENT', 'REMBOURSEMENT', 'ANNULATION');

-- CreateEnum
CREATE TYPE "PorteeCloture" AS ENUM ('JOUR', 'MOIS', 'EXERCICE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'ENCAISSEMENT';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'REMBOURSEMENT';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'ANNULATION_ENCAISSEMENT';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'CAISSE_OUVERTE';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'CAISSE_COMPTEE';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'CLOTURE';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'ARCHIVAGE';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'PARAMETRE_MODIFIE';
ALTER TYPE "TypeEvenementCaisse" ADD VALUE 'VERIFICATION_ECHEC';

-- AlterTable
ALTER TABLE "evenement_caisse" ADD COLUMN     "format" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "acteur_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "facture" ADD COLUMN     "acomptes_deduits_centimes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "encaissement" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "facture_id" TEXT,
    "devis_id" TEXT,
    "origine_id" TEXT,
    "nature" "NatureMouvement" NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    "remis_centimes" INTEGER,
    "rendu_centimes" INTEGER NOT NULL DEFAULT 0,
    "partenaire" TEXT,
    "echeances" INTEGER,
    "reference" TEXT,
    "motif" TEXT,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "encaissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_caisse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "journee" DATE NOT NULL,
    "fond_centimes" INTEGER NOT NULL,
    "fond_attendu_centimes" INTEGER NOT NULL,
    "justification" TEXT,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comptage_caisse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "comptees_centimes" INTEGER NOT NULL,
    "theorique_centimes" INTEGER NOT NULL,
    "ecart_centimes" INTEGER NOT NULL,
    "remise_centimes" INTEGER NOT NULL DEFAULT 0,
    "justification" TEXT,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "acteur_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comptage_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloture_caisse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "portee" "PorteeCloture" NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "rang_debut" INTEGER NOT NULL,
    "rang_fin" INTEGER NOT NULL,
    "totaux" JSONB NOT NULL,
    "grand_total_centimes" BIGINT NOT NULL,
    "perpetuel_centimes" BIGINT NOT NULL,
    "encaisse_perpetuel_centimes" BIGINT NOT NULL,
    "version_caisse" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "signature" TEXT NOT NULL,
    "cle_id" TEXT NOT NULL,
    "acteur_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cloture_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_caisse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "rang_debut" INTEGER NOT NULL,
    "rang_fin" INTEGER NOT NULL,
    "cle" TEXT NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "empreinte_contenu" CHAR(64) NOT NULL,
    "version_caisse" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "signature" TEXT NOT NULL,
    "cle_id" TEXT NOT NULL,
    "acteur_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "archive_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametres_comptables" (
    "centre_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "comptes" JSONB NOT NULL,
    "profil" JSONB NOT NULL,
    "mois_cloture_exercice" INTEGER NOT NULL DEFAULT 12,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_comptables_pkey" PRIMARY KEY ("centre_id")
);

-- CreateIndex
CREATE INDEX "encaissement_organisation_id_idx" ON "encaissement"("organisation_id");

-- CreateIndex
CREATE INDEX "encaissement_centre_id_created_at_idx" ON "encaissement"("centre_id", "created_at");

-- CreateIndex
CREATE INDEX "encaissement_patient_id_idx" ON "encaissement"("patient_id");

-- CreateIndex
CREATE INDEX "encaissement_facture_id_idx" ON "encaissement"("facture_id");

-- CreateIndex
CREATE INDEX "encaissement_devis_id_idx" ON "encaissement"("devis_id");

-- CreateIndex
CREATE INDEX "encaissement_origine_id_idx" ON "encaissement"("origine_id");

-- CreateIndex
CREATE UNIQUE INDEX "encaissement_centre_id_rang_key" ON "encaissement"("centre_id", "rang");

-- CreateIndex
CREATE INDEX "session_caisse_organisation_id_idx" ON "session_caisse"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_caisse_centre_id_journee_key" ON "session_caisse"("centre_id", "journee");

-- CreateIndex
CREATE UNIQUE INDEX "session_caisse_centre_id_rang_key" ON "session_caisse"("centre_id", "rang");

-- CreateIndex
CREATE INDEX "comptage_caisse_organisation_id_idx" ON "comptage_caisse"("organisation_id");

-- CreateIndex
CREATE INDEX "comptage_caisse_session_id_idx" ON "comptage_caisse"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "comptage_caisse_centre_id_rang_key" ON "comptage_caisse"("centre_id", "rang");

-- CreateIndex
CREATE INDEX "cloture_caisse_organisation_id_idx" ON "cloture_caisse"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloture_caisse_centre_id_portee_debut_key" ON "cloture_caisse"("centre_id", "portee", "debut");

-- CreateIndex
CREATE UNIQUE INDEX "cloture_caisse_centre_id_rang_key" ON "cloture_caisse"("centre_id", "rang");

-- CreateIndex
CREATE UNIQUE INDEX "archive_caisse_cle_key" ON "archive_caisse"("cle");

-- CreateIndex
CREATE INDEX "archive_caisse_organisation_id_idx" ON "archive_caisse"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "archive_caisse_centre_id_debut_fin_key" ON "archive_caisse"("centre_id", "debut", "fin");

-- CreateIndex
CREATE UNIQUE INDEX "archive_caisse_centre_id_rang_key" ON "archive_caisse"("centre_id", "rang");

-- CreateIndex
CREATE INDEX "parametres_comptables_organisation_id_idx" ON "parametres_comptables"("organisation_id");

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_origine_id_fkey" FOREIGN KEY ("origine_id") REFERENCES "encaissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session_caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloture_caisse" ADD CONSTRAINT "cloture_caisse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloture_caisse" ADD CONSTRAINT "cloture_caisse_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloture_caisse" ADD CONSTRAINT "cloture_caisse_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_caisse" ADD CONSTRAINT "archive_caisse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_caisse" ADD CONSTRAINT "archive_caisse_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_caisse" ADD CONSTRAINT "archive_caisse_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_comptables" ADD CONSTRAINT "parametres_comptables_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_comptables" ADD CONSTRAINT "parametres_comptables_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ajouté à la main : contraintes, ajout seul, RLS, droits, cohérence des organisations (ADR-029).

-- En texte : une valeur d'enum ajoutée ne s'utilise pas dans sa transaction.
ALTER TABLE "evenement_caisse" ADD CONSTRAINT "evenement_caisse_acteur_humain" CHECK (
  "acteur_id" IS NOT NULL OR "type"::text IN ('CLOTURE', 'ARCHIVAGE', 'VERIFICATION_ECHEC')
);

ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_facture_ou_devis" CHECK (
  ("facture_id" IS NULL) <> ("devis_id" IS NULL)
);
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_montant_positif" CHECK ("montant_centimes" > 0);
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_origine" CHECK (
  ("nature" = 'ENCAISSEMENT') = ("origine_id" IS NULL)
);
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_motif_obligatoire" CHECK (
  ("nature" = 'ENCAISSEMENT') = ("motif" IS NULL)
);
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_rendu_especes" CHECK (
  "rendu_centimes" >= 0
  AND ("remis_centimes" IS NULL OR "mode" = 'ESPECES')
  AND ("rendu_centimes" = 0 OR "remis_centimes" IS NOT NULL)
  AND ("remis_centimes" IS NULL OR "remis_centimes" - "rendu_centimes" = "montant_centimes")
);
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_financement" CHECK (
  ("mode" = 'FINANCEMENT' AND "nature" = 'ENCAISSEMENT') = ("partenaire" IS NOT NULL)
  AND ("partenaire" IS NOT NULL) = ("echeances" IS NOT NULL)
  AND ("echeances" IS NULL OR "echeances" BETWEEN 1 AND 60)
);
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_partenaire_chiffre" CHECK ("partenaire" LIKE 'v1.%');
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_reference_chiffree" CHECK ("reference" LIKE 'v1.%');
ALTER TABLE "encaissement" ADD CONSTRAINT "encaissement_motif_chiffre" CHECK ("motif" LIKE 'v1.%');

ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_fond_positif" CHECK ("fond_centimes" >= 0);
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_fond_justifie" CHECK (
  "fond_centimes" = "fond_attendu_centimes" OR "justification" IS NOT NULL
);
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_justification_chiffree" CHECK ("justification" LIKE 'v1.%');

ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_ecart" CHECK (
  "ecart_centimes" = "comptees_centimes" - "theorique_centimes"
);
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_montants_positifs" CHECK (
  "comptees_centimes" >= 0 AND "remise_centimes" >= 0 AND "remise_centimes" <= "comptees_centimes"
);
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_ecart_justifie" CHECK (
  "ecart_centimes" = 0 OR "justification" IS NOT NULL
);
ALTER TABLE "comptage_caisse" ADD CONSTRAINT "comptage_caisse_justification_chiffree" CHECK ("justification" LIKE 'v1.%');

ALTER TABLE "cloture_caisse" ADD CONSTRAINT "cloture_caisse_periode" CHECK (
  "debut" <= "fin" AND "rang_debut" <= "rang_fin"
);
ALTER TABLE "archive_caisse" ADD CONSTRAINT "archive_caisse_periode" CHECK (
  "debut" <= "fin" AND "rang_debut" <= "rang_fin"
);

ALTER TABLE "parametres_comptables" ADD CONSTRAINT "parametres_comptables_mois" CHECK (
  "mois_cloture_exercice" BETWEEN 1 AND 12
);

-- Ces tables sont en ajout seul, en plus de leurs droits : une correction est une nouvelle ligne.
CREATE FUNCTION caisse_ajout_seul() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% : ajout seul', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER encaissement_ajout_seul BEFORE UPDATE OR DELETE ON "encaissement"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();
CREATE TRIGGER session_caisse_ajout_seul BEFORE UPDATE OR DELETE ON "session_caisse"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();
CREATE TRIGGER comptage_caisse_ajout_seul BEFORE UPDATE OR DELETE ON "comptage_caisse"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();
CREATE TRIGGER cloture_caisse_ajout_seul BEFORE UPDATE OR DELETE ON "cloture_caisse"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();
CREATE TRIGGER archive_caisse_ajout_seul BEFORE UPDATE OR DELETE ON "archive_caisse"
  FOR EACH ROW EXECUTE FUNCTION caisse_ajout_seul();

-- La tête n'avance que d'un rang, vers un maillon déjà écrit. `updated_at` seul : la pose du verrou.
CREATE FUNCTION chaine_caisse_avance() RETURNS trigger AS $$
BEGIN
  IF NEW.dernier_rang = OLD.dernier_rang AND NEW.derniere_empreinte = OLD.derniere_empreinte THEN
    RETURN NEW;
  END IF;
  IF NEW.dernier_rang <> OLD.dernier_rang + 1 OR NOT EXISTS (
    SELECT 1 FROM "evenement_caisse" e
    WHERE e.centre_id = NEW.centre_id AND e.rang = NEW.dernier_rang AND e.empreinte = NEW.derniere_empreinte
  ) THEN
    RAISE EXCEPTION 'tête de chaîne : avance refusée' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chaine_caisse_avance BEFORE UPDATE ON "chaine_caisse"
  FOR EACH ROW EXECUTE FUNCTION chaine_caisse_avance();

-- Une série ne recule jamais : un numéro rendu laisserait un trou ou un doublon.
CREATE FUNCTION serie_facture_croissante() RETURNS trigger AS $$
BEGIN
  IF NEW.dernier_numero < OLD.dernier_numero THEN
    RAISE EXCEPTION 'série : recul refusé' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER serie_facture_croissante BEFORE UPDATE ON "serie_facture"
  FOR EACH ROW EXECUTE FUNCTION serie_facture_croissante();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['encaissement', 'session_caisse', 'comptage_caisse', 'cloture_caisse', 'archive_caisse', 'parametres_comptables']
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

GRANT SELECT, INSERT ON "encaissement", "session_caisse", "comptage_caisse", "cloture_caisse", "archive_caisse" TO ha_app;
GRANT SELECT, INSERT, UPDATE ON "parametres_comptables" TO ha_app;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('encaissement', 'centre', 'centre_id'),
      ('encaissement', 'patient', 'patient_id'),
      ('encaissement', 'facture', 'facture_id'),
      ('encaissement', 'devis', 'devis_id'),
      ('encaissement', 'encaissement', 'origine_id'),
      ('encaissement', 'utilisateur', 'acteur_id'),
      ('session_caisse', 'centre', 'centre_id'),
      ('session_caisse', 'utilisateur', 'acteur_id'),
      ('comptage_caisse', 'centre', 'centre_id'),
      ('comptage_caisse', 'session_caisse', 'session_id'),
      ('comptage_caisse', 'utilisateur', 'acteur_id'),
      ('cloture_caisse', 'centre', 'centre_id'),
      ('cloture_caisse', 'utilisateur', 'acteur_id'),
      ('archive_caisse', 'centre', 'centre_id'),
      ('archive_caisse', 'utilisateur', 'acteur_id'),
      ('parametres_comptables', 'centre', 'centre_id')
    ) AS refs(enfant, parent, colonne)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
