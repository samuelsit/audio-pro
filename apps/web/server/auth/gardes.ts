import { deuxFacteursObligatoire, peutAccederAuCentre, type Role } from '@ha/domain';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import {
  AccesRefuseError,
  chargerUtilisateurConnecte,
  resoudrePerimetreActeur,
  type UtilisateurConnecte,
} from './acces';
import { auth } from './auth';
import { CHEMIN_CONNEXION, COOKIE_CENTRE_COURANT } from './constantes';

// Gardes pour les pages et server actions. Les services revérifient les droits de leur côté.

/** Utilisateur de la session courante, relu en base (une fois par requête). */
export const utilisateurConnecte = cache(async (): Promise<UtilisateurConnecte | null> => {
  const session = await auth().api.getSession({ headers: await headers() });
  return session ? chargerUtilisateurConnecte(session.user.id) : null;
});

/**
 * Exige une session valide d'un compte actif. Par défaut, impose aussi les étapes obligatoires :
 * changement du mot de passe provisoire, puis activation de la 2FA pour un ADMIN.
 */
export async function requireSession({
  etapesObligatoires = true,
}: { etapesObligatoires?: boolean } = {}): Promise<UtilisateurConnecte> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    redirect(CHEMIN_CONNEXION);
  }
  if (etapesObligatoires) {
    if (utilisateur.doitChangerMotDePasse) {
      redirect('/compte/mot-de-passe');
    }
    if (deuxFacteursObligatoire(utilisateur.role) && !utilisateur.twoFactorEnabled) {
      redirect('/compte/2fa');
    }
  }
  return utilisateur;
}

/** Exige l'un des rôles ; sinon 404 (on ne révèle pas l'existence de la page). */
export async function requireRole(...roles: readonly Role[]): Promise<UtilisateurConnecte> {
  const utilisateur = await requireSession();
  if (!roles.includes(utilisateur.role)) {
    notFound();
  }
  return utilisateur;
}

/** Exige l'accès au centre ; sinon 404. */
export async function requireCentreAccess(centreId: string): Promise<UtilisateurConnecte> {
  const utilisateur = await requireSession();
  if (!peutAccederAuCentre(utilisateur, centreId)) {
    notFound();
  }
  return utilisateur;
}

/** Périmètre courant, résolu depuis le cookie du sélecteur et revalidé contre les droits. */
export const perimetreCourant = cache(async () => {
  const acteur = await requireSession();
  const choix = (await cookies()).get(COOKIE_CENTRE_COURANT)?.value;
  const { perimetre, centres } = await resoudrePerimetreActeur(acteur, choix);
  return { acteur, perimetre, centres };
});

/** Pour les pages de détail : un accès refusé par un service devient une 404. */
export async function ouIntrouvable<T>(resultat: Promise<T>): Promise<T> {
  try {
    return await resultat;
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError) {
      notFound();
    }
    throw erreur;
  }
}
