import {
  deuxFacteursObligatoire,
  peutAccederAuCentre,
  ROLE_SUPERADMIN,
  type Role,
} from '@ha/domain';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import {
  AccesRefuseError,
  chargerCompteConnecte,
  resoudrePerimetreActeur,
  type CompteConnecte,
  type SuperadminConnecte,
  type UtilisateurConnecte,
} from './acces';
import { auth } from './auth';
import { CHEMIN_CONNEXION, CHEMIN_CONSOLE, COOKIE_CENTRE_COURANT } from './constantes';

// Gardes pour les pages et server actions. Les services revérifient les droits de leur côté.

/** Compte de la session courante, relu en base (une fois par requête). */
export const compteConnecte = cache(async (): Promise<CompteConnecte | null> => {
  const session = await auth().api.getSession({ headers: await headers() });
  return session ? chargerCompteConnecte(session.user.id) : null;
});

/**
 * Exige une session valide d'un compte actif, client ou éditeur. Par défaut, impose aussi les étapes
 * obligatoires : changement du mot de passe provisoire, puis activation de la 2FA si elle est exigée.
 */
export async function requireCompte({
  etapesObligatoires = true,
}: { etapesObligatoires?: boolean } = {}): Promise<CompteConnecte> {
  const compte = await compteConnecte();
  if (!compte) {
    redirect(CHEMIN_CONNEXION);
  }
  if (etapesObligatoires) {
    if (compte.doitChangerMotDePasse) {
      redirect('/compte/mot-de-passe');
    }
    if (deuxFacteursObligatoire(compte.role) && !compte.twoFactorEnabled) {
      redirect('/compte/2fa');
    }
  }
  return compte;
}

/** Exige un utilisateur d'un client. Un SUPERADMIN n'a pas d'organisation : il part vers la console. */
export async function requireSession(options?: {
  etapesObligatoires?: boolean;
}): Promise<UtilisateurConnecte> {
  const compte = await requireCompte(options);
  if (compte.role === ROLE_SUPERADMIN) {
    redirect(CHEMIN_CONSOLE);
  }
  return compte;
}

/** Exige un compte de la console éditeur ; sinon 404. */
export async function requireSuperadmin(): Promise<SuperadminConnecte> {
  const compte = await requireCompte();
  if (compte.role !== ROLE_SUPERADMIN) {
    notFound();
  }
  return compte;
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
