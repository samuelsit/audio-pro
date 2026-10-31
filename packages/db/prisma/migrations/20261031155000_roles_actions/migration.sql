-- Rôles du SaaS (ADR-016) et action d'audit SEND.
-- Migration à part : une valeur ajoutée à un enum n'est utilisable qu'après le commit.
-- RENAME VALUE ne réécrit aucune ligne : le journal en ajout seul n'est pas sollicité.
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'ADMIN_CLIENT';
ALTER TYPE "Role" ADD VALUE 'RESPONSABLE_CENTRE';
ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';
ALTER TYPE "ActionAudit" ADD VALUE 'SEND';
