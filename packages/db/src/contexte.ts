import { clientPartage } from './client';
import type { Prisma, PrismaClient } from './generated/prisma/client';

// Accès à la base depuis l'application (ADR-016). Le rôle ha_app est soumis à la RLS : sans contexte client,
// les tables métier ne renvoient aucune ligne.

/** Rôle ha_app, sans contexte : seul le référentiel LPP y répond. */
export function clientApplication(): PrismaClient {
  return clientPartage('DATABASE_URL');
}

/** Référentiel LPP, commun à tous les clients. */
export function referentielLpp(): Pick<
  PrismaClient,
  'lppVersion' | 'lppCode' | 'lppFiche' | 'lppTarif' | 'lppLien'
> {
  return clientApplication();
}

/**
 * Rôle ha_plateforme : authentification et console éditeur, avant ou hors de tout contexte client.
 * Il passe outre la RLS, mais n'a aucun droit sur les tables de données patient.
 */
export function clientPlateforme(): PrismaClient {
  return clientPartage('DATABASE_URL_PLATEFORME');
}

/** Pose le contexte client pour la transaction en cours : rien ne survit à son commit. */
export function poserContexte(
  client: Pick<PrismaClient, '$executeRaw'>,
  organisationId: string,
): Prisma.PrismaPromise<number> {
  return client.$executeRaw`SELECT set_config('app.organisation_id', ${organisationId}, TRUE)`;
}

/**
 * Client lié à un client de l'éditeur : chaque requête part dans une transaction d'une ligne qui pose le
 * contexte juste avant. Les transactions interactives passent par `poserContexte`.
 */
export function clientOrganisation(organisationId: string) {
  const client = clientApplication();
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const [, resultat] = await client.$transaction([
          poserContexte(client, organisationId),
          query(args) as Prisma.PrismaPromise<unknown>,
        ]);
        return resultat;
      },
    },
  });
}
