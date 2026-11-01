-- Un rendez-vous d'essai devient un rendez-vous de l'agenda ; `essai_rdv` en garde le compte rendu (ADR-027).
ALTER TABLE "essai_rdv" ADD COLUMN "rendez_vous_id" TEXT;

-- Premier créneau libre du praticien ce jour-là, à partir de 9 h : l'ancienne trace n'a pas d'heure, et la
-- contrainte d'exclusion interdit de superposer deux rendez-vous. L'heure est conventionnelle.
CREATE FUNCTION pg_temp.creneau_libre(praticien TEXT, jour DATE, duree INTEGER) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql AS $$
DECLARE
  candidat TIMESTAMPTZ := (jour + TIME '09:00') AT TIME ZONE 'Europe/Paris';
BEGIN
  FOR rang IN 0..47 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM "rendez_vous" r
      WHERE r."praticien_id" = praticien
        AND r."statut" NOT IN ('ANNULE', 'ABSENT')
        AND tstzrange(r."debut", r."fin") && tstzrange(candidat, candidat + make_interval(mins => duree))
    ) THEN
      RETURN candidat;
    END IF;
    candidat := candidat + INTERVAL '30 minutes';
  END LOOP;
  RAISE EXCEPTION 'aucun créneau libre pour le praticien % le %', praticien, jour;
END;
$$;

-- Type de chaque nature, par organisation : celui du client s'il existe, sinon un type inactif de reprise.
INSERT INTO "type_rdv" (
  "id", "organisation_id", "nom", "duree_minutes", "couleur", "requiere_praticien", "requiere_cabine",
  "nature_essai", "actif", "updated_at"
)
SELECT
  gen_random_uuid()::text, manquants.organisation_id, manquants.nom, 30, '#64748b', true, false,
  manquants.nature, false, now()
FROM (
  SELECT DISTINCT d."organisation_id", er."type" AS nature,
    'Essai ' || lower(er."type"::text) || ' (reprise)' AS nom
  FROM "essai_rdv" er
  JOIN "essai" e ON e."id" = er."essai_id"
  JOIN "dossier" d ON d."id" = e."dossier_id"
  WHERE NOT EXISTS (
    SELECT 1 FROM "type_rdv" t
    WHERE t."organisation_id" = d."organisation_id" AND t."nature_essai" = er."type"
  )
) AS manquants;

ALTER TABLE "essai_rdv" DISABLE TRIGGER essai_rdv_ajout_seul;

DO $$
DECLARE
  ligne RECORD;
  rdv_id TEXT;
  instant_debut TIMESTAMPTZ;
BEGIN
  FOR ligne IN
    SELECT
      er."id", er."date", er."type", er."created_by_id", er."created_at",
      d."id" AS dossier_id, d."organisation_id", d."centre_id", d."patient_id", d."praticien_id",
      t."id" AS type_rdv_id, t."duree_minutes"
    FROM "essai_rdv" er
    JOIN "essai" e ON e."id" = er."essai_id"
    JOIN "dossier" d ON d."id" = e."dossier_id"
    JOIN LATERAL (
      SELECT ty."id", ty."duree_minutes" FROM "type_rdv" ty
      WHERE ty."organisation_id" = d."organisation_id" AND ty."nature_essai" = er."type"
      ORDER BY ty."actif" DESC, ty."id"
      LIMIT 1
    ) t ON true
    ORDER BY er."date", er."id"
  LOOP
    -- Un rendez-vous réellement tenu ce jour-là, déjà rattaché au dossier, évite un doublon.
    SELECT r."id" INTO rdv_id
    FROM "rendez_vous" r
    JOIN "type_rdv" ty ON ty."id" = r."type_rdv_id"
    WHERE r."dossier_id" = ligne.dossier_id
      AND r."statut" = 'VU'
      AND ty."nature_essai" = ligne."type"
      AND (r."debut" AT TIME ZONE 'Europe/Paris')::date = ligne."date"
      AND NOT EXISTS (SELECT 1 FROM "essai_rdv" pris WHERE pris."rendez_vous_id" = r."id")
    ORDER BY r."debut"
    LIMIT 1;

    IF rdv_id IS NULL THEN
      rdv_id := gen_random_uuid()::text;
      instant_debut := pg_temp.creneau_libre(ligne."praticien_id", ligne."date", ligne."duree_minutes");
      INSERT INTO "rendez_vous" (
        "id", "organisation_id", "centre_id", "type_rdv_id", "patient_id", "dossier_id", "praticien_id",
        "debut", "fin", "statut", "origine", "created_by_id", "created_at", "updated_at"
      ) VALUES (
        rdv_id, ligne."organisation_id", ligne."centre_id", ligne.type_rdv_id, ligne."patient_id",
        ligne.dossier_id, ligne."praticien_id", instant_debut,
        instant_debut + make_interval(mins => ligne."duree_minutes"),
        'VU', 'INTERNE', ligne."created_by_id", ligne."created_at", now()
      );
    END IF;

    UPDATE "essai_rdv" SET "rendez_vous_id" = rdv_id WHERE "id" = ligne."id";
  END LOOP;
END;
$$;

ALTER TABLE "essai_rdv" ENABLE TRIGGER essai_rdv_ajout_seul;

ALTER TABLE "essai_rdv" ALTER COLUMN "rendez_vous_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "essai_rdv_rendez_vous_id_key" ON "essai_rdv"("rendez_vous_id");

-- AddForeignKey
ALTER TABLE "essai_rdv" ADD CONSTRAINT "essai_rdv_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "rendez_vous"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "zz_meme_organisation_rendez_vous_id" BEFORE INSERT OR UPDATE OF "rendez_vous_id" ON "essai_rdv"
  FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation('rendez_vous', 'rendez_vous_id');
