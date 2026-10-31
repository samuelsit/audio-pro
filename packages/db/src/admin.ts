import { clientPartage, creerPrismaClient } from './client';
import type { PrismaClient } from './generated/prisma/client';

// Rôle propriétaire : migrations, seed, import LPP et outillage de test. Jamais importé par l'application
// web (règle ESLint) : il passe outre la RLS.

export { creerPrismaClient };
export {
  configurerRoles,
  preparerBaseJetable,
  ROLES_CONNEXION,
  urlDuRole,
  verifierBaseJetable,
  viderBaseJetable,
} from './outils';

/** Client propriétaire, pour les scripts et les tests. */
export function prisma(): PrismaClient {
  return clientPartage('DATABASE_URL_ADMIN');
}
