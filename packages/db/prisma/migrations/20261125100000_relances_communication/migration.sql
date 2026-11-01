-- CreateEnum
CREATE TYPE "CanalMessage" AS ENUM ('SMS', 'EMAIL', 'COURRIER');

-- CreateEnum
CREATE TYPE "FinaliteMessage" AS ENUM ('SUIVI', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "ScenarioCommunication" AS ENUM ('RAPPEL_RDV_J2', 'RAPPEL_RDV_J1', 'CONFIRMATION_RDV', 'DEPLACEMENT_RDV', 'ANNULATION_RDV', 'RELANCE_DEVIS', 'FIN_ESSAI', 'CONTROLE_ANNUEL', 'RENOUVELLEMENT', 'FIN_GARANTIE', 'ANNIVERSAIRE');

-- CreateEnum
CREATE TYPE "StatutMessage" AS ENUM ('A_ENVOYER', 'ENVOYE', 'DELIVRE', 'ECHEC', 'BLOQUE', 'EXPIRE', 'A_IMPRIMER', 'IMPRIME');

-- CreateEnum
CREATE TYPE "OrigineConsentement" AS ENUM ('FICHE', 'AGENDA', 'RESERVATION', 'VITALE', 'FUSION', 'RECUEIL', 'DESINSCRIPTION', 'STOP_SMS');

-- CreateEnum
CREATE TYPE "StatutCampagne" AS ENUM ('PROGRAMMEE', 'EN_COURS', 'TERMINEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutLotCourrier" AS ENUM ('A_GENERER', 'PRET', 'IMPRIME');

-- CreateEnum
CREATE TYPE "TypeLotCourrier" AS ENUM ('LETTRES', 'COMPTES_RENDUS');


-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "message_patient_id" TEXT,
ADD COLUMN     "priorite" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "consentement_courrier_commercial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentement_email_commercial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentement_sms_commercial" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prescripteur" ADD COLUMN     "adresse_ligne1" TEXT,
ADD COLUMN     "adresse_ligne2" TEXT,
ADD COLUMN     "code_postal" TEXT,
ADD COLUMN     "ville" TEXT;

-- CreateTable
CREATE TABLE "parametres_communication" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "heure_debut" TEXT NOT NULL,
    "heure_fin" TEXT NOT NULL,
    "jours" TEXT[],
    "feries" BOOLEAN NOT NULL,
    "tarif_sms_millimes" INTEGER NOT NULL,
    "devis_delai_jours" INTEGER NOT NULL,
    "devis_relances_max" INTEGER NOT NULL,
    "fin_essai_avance_jours" INTEGER NOT NULL,
    "controle_avance_jours" INTEGER NOT NULL,
    "garantie_avance_jours" INTEGER NOT NULL,
    "renouvellement_fenetre_jours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglage_scenario" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "scenario" "ScenarioCommunication" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "canaux" "CanalMessage"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglage_scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modele_message" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "nom" TEXT NOT NULL,
    "scenario" "ScenarioCommunication",
    "sujet" TEXT NOT NULL,
    "corps_email" TEXT NOT NULL,
    "corps_sms" TEXT NOT NULL,
    "corps_courrier" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modele_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_consentement" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "patient_id" TEXT NOT NULL,
    "canal" "CanalMessage" NOT NULL,
    "finalite" "FinaliteMessage" NOT NULL,
    "accorde" BOOLEAN NOT NULL,
    "origine" "OrigineConsentement" NOT NULL,
    "auteur" TEXT NOT NULL,
    "survenu_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_consentement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opposition_adresse" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "canal" "CanalMessage" NOT NULL,
    "empreinte" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "origine" "OrigineConsentement" NOT NULL,
    "survenue_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opposition_adresse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campagne" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "nom" TEXT NOT NULL,
    "modele_id" TEXT NOT NULL,
    "canal" "CanalMessage" NOT NULL,
    "segment" JSONB NOT NULL,
    "statut" "StatutCampagne" NOT NULL DEFAULT 'PROGRAMMEE',
    "programmee_le" TIMESTAMPTZ(3) NOT NULL,
    "lancee_le" TIMESTAMPTZ(3),
    "destinataires" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campagne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_courrier" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "type" "TypeLotCourrier" NOT NULL,
    "statut" "StatutLotCourrier" NOT NULL DEFAULT 'A_GENERER',
    "document_cle" TEXT,
    "lettres" INTEGER NOT NULL DEFAULT 0,
    "genere_le" TIMESTAMPTZ(3),
    "imprime_le" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_courrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_patient" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL DEFAULT app_organisation_id(),
    "centre_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "canal" "CanalMessage" NOT NULL,
    "finalite" "FinaliteMessage" NOT NULL,
    "scenario" "ScenarioCommunication",
    "campagne_id" TEXT,
    "lot_courrier_id" TEXT,
    "rendez_vous_id" TEXT,
    "rdv_debut" TIMESTAMPTZ(3),
    "entite_id" TEXT,
    "modele_version" INTEGER,
    "sujet" TEXT,
    "corps" TEXT,
    "empreinte_adresse" TEXT,
    "cle_idempotence" TEXT NOT NULL,
    "statut" "StatutMessage" NOT NULL DEFAULT 'A_ENVOYER',
    "motif" TEXT,
    "id_fournisseur" TEXT,
    "segments" INTEGER,
    "cout_millimes" INTEGER,
    "expire_le" TIMESTAMPTZ(3),
    "envoye_le" TIMESTAMPTZ(3),
    "delivre_le" TIMESTAMPTZ(3),
    "echec_le" TIMESTAMPTZ(3),
    "clic_le" TIMESTAMPTZ(3),
    "desinscrit_le" TIMESTAMPTZ(3),
    "code_court" TEXT,
    "lien_cible" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametres_communication_organisation_id_key" ON "parametres_communication"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "reglage_scenario_organisation_id_scenario_key" ON "reglage_scenario"("organisation_id", "scenario");

-- CreateIndex
CREATE UNIQUE INDEX "modele_message_organisation_id_scenario_key" ON "modele_message"("organisation_id", "scenario");

-- CreateIndex
CREATE INDEX "evenement_consentement_patient_id_survenu_le_idx" ON "evenement_consentement"("patient_id", "survenu_le");

-- CreateIndex
CREATE UNIQUE INDEX "opposition_adresse_organisation_id_canal_empreinte_key" ON "opposition_adresse"("organisation_id", "canal", "empreinte");

-- CreateIndex
CREATE INDEX "campagne_organisation_id_statut_programmee_le_idx" ON "campagne"("organisation_id", "statut", "programmee_le");

-- CreateIndex
CREATE INDEX "campagne_modele_id_idx" ON "campagne"("modele_id");

-- CreateIndex
CREATE INDEX "lot_courrier_centre_id_statut_idx" ON "lot_courrier"("centre_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "message_patient_code_court_key" ON "message_patient"("code_court");

-- CreateIndex
CREATE INDEX "message_patient_patient_id_created_at_idx" ON "message_patient"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "message_patient_centre_id_envoye_le_idx" ON "message_patient"("centre_id", "envoye_le");

-- CreateIndex
CREATE INDEX "message_patient_organisation_id_statut_envoye_le_idx" ON "message_patient"("organisation_id", "statut", "envoye_le");

-- CreateIndex
CREATE INDEX "message_patient_empreinte_adresse_idx" ON "message_patient"("empreinte_adresse");

-- CreateIndex
CREATE INDEX "message_patient_campagne_id_idx" ON "message_patient"("campagne_id");

-- CreateIndex
CREATE INDEX "message_patient_lot_courrier_id_idx" ON "message_patient"("lot_courrier_id");

-- CreateIndex
CREATE INDEX "message_patient_rendez_vous_id_idx" ON "message_patient"("rendez_vous_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_patient_organisation_id_cle_idempotence_key" ON "message_patient"("organisation_id", "cle_idempotence");

-- CreateIndex
CREATE INDEX "notification_message_patient_id_idx" ON "notification"("message_patient_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_message_patient_id_fkey" FOREIGN KEY ("message_patient_id") REFERENCES "message_patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametres_communication" ADD CONSTRAINT "parametres_communication_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglage_scenario" ADD CONSTRAINT "reglage_scenario_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_message" ADD CONSTRAINT "modele_message_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_consentement" ADD CONSTRAINT "evenement_consentement_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_consentement" ADD CONSTRAINT "evenement_consentement_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opposition_adresse" ADD CONSTRAINT "opposition_adresse_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campagne" ADD CONSTRAINT "campagne_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campagne" ADD CONSTRAINT "campagne_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_courrier" ADD CONSTRAINT "lot_courrier_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_courrier" ADD CONSTRAINT "lot_courrier_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_campagne_id_fkey" FOREIGN KEY ("campagne_id") REFERENCES "campagne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_lot_courrier_id_fkey" FOREIGN KEY ("lot_courrier_id") REFERENCES "lot_courrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Nouvelles tables : RLS, organisation immuable, droits de l'application.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'parametres_communication', 'reglage_scenario', 'modele_message', 'evenement_consentement',
    'opposition_adresse', 'campagne', 'lot_courrier', 'message_patient'
  ] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "parametres_communication", "reglage_scenario", "modele_message", "opposition_adresse", "campagne", "lot_courrier" TO ha_app;
GRANT SELECT, INSERT, UPDATE ON "message_patient" TO ha_app;
GRANT SELECT, INSERT ON "evenement_consentement" TO ha_app;

-- Le journal des consentements ne se réécrit pas.
CREATE TRIGGER evenement_consentement_ajout_seul
  BEFORE UPDATE OR DELETE ON "evenement_consentement"
  FOR EACH ROW EXECUTE FUNCTION mouvement_stock_ajout_seul();

-- Une référence ne franchit pas la frontière d'un client.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('evenement_consentement', 'patient', 'patient_id'),
    ('campagne', 'modele_message', 'modele_id'),
    ('lot_courrier', 'centre', 'centre_id'),
    ('message_patient', 'centre', 'centre_id'),
    ('message_patient', 'patient', 'patient_id'),
    ('message_patient', 'campagne', 'campagne_id'),
    ('message_patient', 'lot_courrier', 'lot_courrier_id'),
    ('message_patient', 'rendez_vous', 'rendez_vous_id')
  ) AS v(enfant, parent, colonne) LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      'zz_meme_organisation_' || r.colonne, r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;

-- Champs chiffrés : une valeur en clair ne passe pas.
ALTER TABLE "opposition_adresse" ADD CONSTRAINT "opposition_adresse_adresse_chiffree" CHECK ("adresse" LIKE 'v1.%');
ALTER TABLE "message_patient" ADD CONSTRAINT "message_patient_textes_chiffres" CHECK (
  ("sujet" IS NULL OR "sujet" LIKE 'v1.%')
  AND ("corps" IS NULL OR "corps" LIKE 'v1.%')
  AND ("lien_cible" IS NULL OR "lien_cible" LIKE 'v1.%')
);

ALTER TABLE "parametres_communication" ADD CONSTRAINT "parametres_communication_valeurs" CHECK (
  "tarif_sms_millimes" >= 0 AND "devis_delai_jours" >= 1 AND "devis_relances_max" >= 0
);
ALTER TABLE "lot_courrier" ADD CONSTRAINT "lot_courrier_lettres_positives" CHECK ("lettres" >= 0);

-- Un message part pour une réservation, un document, une commande, ou pour lui-même.
ALTER TABLE "notification" DROP CONSTRAINT "notification_une_source";
ALTER TABLE "notification" ADD CONSTRAINT "notification_une_source" CHECK (
  num_nonnulls("reservation_id", "lien_document_id", "commande_id") = 1
  OR (
    num_nonnulls("reservation_id", "lien_document_id", "commande_id") = 0
    AND "message_patient_id" IS NOT NULL
  )
);

CREATE TRIGGER "notification_heriter_organisation_message" BEFORE INSERT ON "notification"
  FOR EACH ROW WHEN (NEW."message_patient_id" IS NOT NULL)
  EXECUTE FUNCTION heriter_organisation('message_patient', 'message_patient_id');

CREATE TRIGGER zz_meme_organisation_message_patient_id BEFORE INSERT OR UPDATE OF "message_patient_id" ON "notification"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('message_patient', 'message_patient_id');

-- `ha_plateforme` résout un lien court ou un STOP, et voit quoi répartir : jamais un texte, une adresse, un patient.
GRANT SELECT ("organisation_id", "canal", "statut", "empreinte_adresse", "code_court", "lot_courrier_id") ON "message_patient" TO ha_plateforme;
GRANT SELECT ("organisation_id", "actif") ON "reglage_scenario" TO ha_plateforme;
GRANT SELECT ("organisation_id", "statut", "programmee_le") ON "campagne" TO ha_plateforme;
