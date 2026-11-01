-- Séparée de la migration suivante : PostgreSQL refuse d'utiliser une valeur d'enum dans la transaction qui l'ajoute.
-- AlterEnum
ALTER TYPE "GabaritNotification" ADD VALUE 'MESSAGE_PATIENT';
