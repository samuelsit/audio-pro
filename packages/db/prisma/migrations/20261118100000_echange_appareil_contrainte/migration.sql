-- Dans sa propre migration : PostgreSQL refuse une valeur d'enum dans la transaction qui l'ajoute.
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_remplace_coherent"
  CHECK ("remplace_par_id" <> "id" AND (("statut" = 'REMPLACE') = ("remplace_par_id" IS NOT NULL)));
