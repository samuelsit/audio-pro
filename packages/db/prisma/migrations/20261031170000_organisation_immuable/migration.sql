-- Une ligne ne change jamais de client (ADR-019) : sans cela, modifier organisation_id contournerait le
-- contrôle des références. Vaut pour tous les rôles. Le trigger ne s'arrête que sur une vraie différence :
-- un upsert qui réécrit la même valeur reste permis.
CREATE FUNCTION organisation_immuable() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'Une ligne ne change pas d''organisation : %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables x USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'organisation_id' AND x.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER zz_organisation_immuable BEFORE UPDATE OF organisation_id ON %I FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION organisation_immuable()',
      t
    );
  END LOOP;
END;
$$;

-- Même contrôle des références, en une seule requête au lieu de deux.
CREATE OR REPLACE FUNCTION verifier_meme_organisation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  valide BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT ($1).%2$I IS NULL OR EXISTS (SELECT 1 FROM %1$I p WHERE p.id = ($1).%2$I::text AND p.organisation_id = ($1).organisation_id)',
    TG_ARGV[0], TG_ARGV[1]
  ) INTO valide USING NEW;
  IF NOT valide THEN
    RAISE EXCEPTION 'Référence hors organisation : %.%', TG_TABLE_NAME, TG_ARGV[1]
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
