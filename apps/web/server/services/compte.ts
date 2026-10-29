import { prisma } from '@ha/db';

import type { UtilisateurConnecte } from '../auth/acces';

/** Le mot de passe provisoire a été remplacé par l'utilisateur lui-même. */
export async function marquerMotDePasseChange(acteur: UtilisateurConnecte): Promise<void> {
  await prisma().utilisateur.update({
    where: { id: acteur.id },
    data: { doitChangerMotDePasse: false },
  });
}
