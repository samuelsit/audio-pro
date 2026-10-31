-- Isolation par client (ADR-016). Sans contexte, app_organisation_id() renvoie NULL : aucune ligne.
-- FORCE : le propriétaire y serait soumis aussi, sauf s'il est superuser ou BYPASSRLS.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'centre',
    'utilisateur',
    'patient',
    'lecture_vitale',
    'fabricant',
    'modele_aide_auditive',
    'accessoire',
    'appareil',
    'mouvement_appareil',
    'mouvement_accessoire',
    'prescripteur',
    'dossier',
    'delivrance',
    'compteur_devis',
    'devis',
    'essai',
    'facture_preparee',
    'journal_audit',
    'utilisateur_centre',
    'praticien',
    'praticien_centre',
    'couverture_amo',
    'couverture_amc',
    'modele_code_lpp',
    'stock_accessoire',
    'transition_dossier',
    'prescription',
    'prise_en_charge',
    'devis_offre',
    'devis_ligne',
    'signature_devis',
    'essai_appareil',
    'essai_rdv',
    'prolongation_essai'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_organisation ON %I USING (organisation_id = app_organisation_id()) WITH CHECK (organisation_id = app_organisation_id())',
      t
    );
  END LOOP;
END;
$$;

ALTER TABLE "organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organisation" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolation_organisation ON "organisation"
  USING ("id" = app_organisation_id()) WITH CHECK ("id" = app_organisation_id());

-- Better Auth écrit ces tables sans connaître l'organisation, et un SUPERADMIN n'en a pas :
-- elles suivent leur utilisateur, lui-même soumis à la RLS.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['session', 'compte', 'deux_facteurs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_organisation ON %I USING (EXISTS (SELECT 1 FROM utilisateur u WHERE u.id = utilisateur_id)) WITH CHECK (EXISTS (SELECT 1 FROM utilisateur u WHERE u.id = utilisateur_id))',
      t
    );
  END LOOP;
END;
$$;
