import { prisma } from '@ha/db';
import { LONGUEUR_MAX_MOT_DE_PASSE, LONGUEUR_MIN_MOT_DE_PASSE } from '@ha/domain';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';

import { PREFIXE_COOKIES } from './constantes';

const DOUZE_HEURES = 12 * 60 * 60;

/**
 * Better Auth est appelé uniquement depuis les server actions (`auth().api.*`) : aucun handler HTTP
 * `/api/auth/*` n'est exposé (voir ADR-002). Pas d'inscription publique : l'ADMIN crée les comptes.
 */
function creerAuth() {
  return betterAuth({
    appName: 'HA-Gestion',
    telemetry: { enabled: false },
    database: prismaAdapter(prisma(), { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: LONGUEUR_MIN_MOT_DE_PASSE,
      maxPasswordLength: LONGUEUR_MAX_MOT_DE_PASSE,
    },
    user: { modelName: 'utilisateur' },
    account: { modelName: 'compte' },
    session: {
      expiresIn: DOUZE_HEURES,
      updateAge: 60 * 60,
      // Pas de cache de session en cookie : une désactivation ou une révocation est immédiate.
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: PREFIXE_COOKIES,
      useSecureCookies: process.env.NODE_ENV === 'production',
      database: { generateId: 'uuid' },
    },
    databaseHooks: {
      session: {
        create: {
          // Un compte désactivé ne peut plus ouvrir de session.
          before: async (session) => {
            const utilisateur = await prisma().utilisateur.findUnique({
              where: { id: session.userId },
              select: { actif: true },
            });
            return utilisateur?.actif === true;
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: 'HA-Gestion',
        schema: { twoFactor: { modelName: 'deuxFacteurs' } },
      }),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof creerAuth> | undefined;

/** Instance créée au premier appel : le build n'a besoin ni de base ni de secret. */
export function auth(): ReturnType<typeof creerAuth> {
  instance ??= creerAuth();
  return instance;
}
