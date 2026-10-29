import type { UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';

/** Le mot de passe provisoire a été remplacé par l'utilisateur lui-même. */
export async function marquerMotDePasseChange(acteur: UtilisateurConnecte): Promise<void> {
  await withAudit(
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
  acteur: UtilisateurConnecte,
  active: boolean,
): Promise<void> {
  await withAudit(acteur, async () => undefined, {
    action: 'UPDATE',
    entiteType: 'UTILISATEUR',
    entiteId: acteur.id,
    champs: [{ champ: 'deuxFacteursActif', masque: false, avant: !active, apres: active }],
  });
}
