-- Une clé étrangère ignore la RLS : sans ce contrôle, une ligne pourrait référencer celle d'un autre client
-- (ADR-019). Chaque référence entre deux tables d'organisation est vérifiée à l'écriture. Sous ha_app, un
-- parent d'un autre client est invisible et donne NULL : même refus.
CREATE FUNCTION verifier_meme_organisation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  reference TEXT;
  organisation_parent TEXT;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', TG_ARGV[1]) INTO reference USING NEW;
  IF reference IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT organisation_id FROM %I WHERE id = $1', TG_ARGV[0])
    INTO organisation_parent USING reference;
  IF organisation_parent IS DISTINCT FROM NEW.organisation_id THEN
    RAISE EXCEPTION 'Référence hors organisation : %.%', TG_TABLE_NAME, TG_ARGV[1]
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Toutes les références vers une colonne `id`, y compris dans une clé composite. Le préfixe `zz_` place ces
-- triggers après `*_heriter_organisation`, qui remplit organisation_id.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT e.relname AS enfant, p.relname AS parent, a.attname AS colonne
    FROM pg_constraint c
    JOIN pg_class e ON e.oid = c.conrelid
    JOIN pg_class p ON p.oid = c.confrelid
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(enfant_att, parent_att)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.enfant_att
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.parent_att
    WHERE c.contype = 'f'
      AND e.relnamespace = 'public'::regnamespace
      AND pa.attname = 'id'
      AND p.relname <> 'organisation'
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.conrelid AND x.attname = 'organisation_id')
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.confrelid AND x.attname = 'organisation_id')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION verifier_meme_organisation(%L, %L)',
      left('zz_meme_organisation_' || r.colonne, 63), r.colonne, r.enfant, r.parent, r.colonne
    );
  END LOOP;
END;
$$;
