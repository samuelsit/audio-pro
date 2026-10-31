import { clientPlateforme } from '@ha/db';
import { ROLE_SUPERADMIN } from '@ha/domain';

import { auteurDepuisActeur, journaliser, withAudit, type EvenementAudit } from '../audit/journal';
import type { CompteConnecte } from '../auth/acces';

/** Assez pour écrire sur son propre compte, dans une transaction de l'un ou l'autre rôle. */
interface ClientCompte {
  readonly utilisateur: {
    update(args: {
      where: { id: string };
      data: { doitChangerMotDePasse: boolean };
    }): PromiseLike<unknown>;
  };
}

/** Comme `withAudit` ; un compte éditeur n'a pas d'organisation, il écrit par le rôle plateforme. */
async function surSonCompte(
  acteur: CompteConnecte,
  operation: (tx: ClientCompte) => PromiseLike<unknown>,
  evenement: EvenementAudit,
): Promise<void> {
  if (acteur.role !== ROLE_SUPERADMIN) {
    await withAudit(acteur, async (tx) => operation(tx), evenement);
    return;
  }
  await clientPlateforme().$transaction(async (tx) => {
    await operation(tx);
    await journaliser(tx, auteurDepuisActeur(acteur), evenement);
  });
}

/** Le mot de passe provisoire a été remplacé par l'utilisateur lui-même. */
export async function marquerMotDePasseChange(acteur: CompteConnecte): Promise<void> {
  await surSonCompte(
    acteur,
    (tx) =>
      tx.utilisateur.update({
        where: { id: acteur.id },
        data: { doitChangerMotDePasse: false },
      }),
    {
      action: 'UPDATE',
      entiteType: 'UTILISATEUR',
      entiteId: acteur.id,
      champs: [
        { champ: 'motDePasse', masque: true },
        ...(acteur.doitChangerMotDePasse
          ? [{ champ: 'doitChangerMotDePasse', masque: false, avant: true, apres: false }]
          : []),
      ],
      details: { motif: 'Changé par l’utilisateur' },
    },
  );
}

/** Journalise l'activation ou la désactivation de la 2FA (faite par Better Auth). */
export async function journaliserDeuxFacteurs(
  acteur: CompteConnecte,
  active: boolean,
): Promise<void> {
  await surSonCompte(acteur, async () => undefined, {
    action: 'UPDATE',
    entiteType: 'UTILISATEUR',
    entiteId: acteur.id,
    champs: [{ champ: 'deuxFacteursActif', masque: false, avant: !active, apres: active }],
  });
}
