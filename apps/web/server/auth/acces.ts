import { clientPlateforme } from '@ha/db';
import {
  clientPeutSeConnecter,
  peutAccederAuCentre,
  peutChoisirTousLesCentres,
  resoudrePerimetre,
  ROLE_SUPERADMIN,
  type Perimetre,
  type ProfilAcces,
  type Role,
} from '@ha/domain';

import { base } from '../chiffrement';

interface IdentiteCompte {
  readonly id: string;
  readonly prenom: string;
  readonly nom: string;
  readonly email: string;
  readonly twoFactorEnabled: boolean;
  readonly doitChangerMotDePasse: boolean;
}

/** Utilisateur d'un client, rechargé depuis la base à chaque requête. */
export interface UtilisateurConnecte extends ProfilAcces, IdentiteCompte {
  readonly organisationId: string;
}

/** Compte de la console éditeur, hors de toute organisation : aucun service métier ne le reçoit. */
export interface SuperadminConnecte extends IdentiteCompte {
  readonly role: typeof ROLE_SUPERADMIN;
  readonly organisationId: null;
}

export type CompteConnecte = UtilisateurConnecte | SuperadminConnecte;

/** Refus d'accès. Le message reste générique : on ne révèle pas l'existence d'une ressource. */
export class AccesRefuseError extends Error {
  constructor() {
    super('Accès refusé.');
    this.name = 'AccesRefuseError';
  }
}

/**
 * Charge le compte et ses rattachements à des centres actifs ; `null` s'il est absent, désactivé ou si son
 * client est suspendu. Lecture sur le rôle plateforme : l'organisation n'est pas encore connue.
 */
export async function chargerCompteConnecte(utilisateurId: string): Promise<CompteConnecte | null> {
  const u = await clientPlateforme().utilisateur.findUnique({
    where: { id: utilisateurId },
    include: {
      centres: { where: { centre: { actif: true } }, select: { centreId: true } },
      organisation: { select: { statut: true } },
    },
  });
  if (!u?.actif || !clientPeutSeConnecter(u.organisation?.statut ?? null)) {
    return null;
  }
  const identite = {
    id: u.id,
    prenom: u.prenom,
    nom: u.nom,
    email: u.email,
    twoFactorEnabled: u.twoFactorEnabled,
    doitChangerMotDePasse: u.doitChangerMotDePasse,
  };
  if (u.role === ROLE_SUPERADMIN || u.organisationId === null) {
    return { ...identite, role: ROLE_SUPERADMIN, organisationId: null };
  }
  return {
    ...identite,
    organisationId: u.organisationId,
    role: u.role,
    centreIds: u.centres.map((c) => c.centreId),
  };
}

/** Comme `chargerCompteConnecte`, pour un utilisateur d'un client : `null` pour un SUPERADMIN. */
export async function chargerUtilisateurConnecte(
  utilisateurId: string,
): Promise<UtilisateurConnecte | null> {
  const compte = await chargerCompteConnecte(utilisateurId);
  return compte === null || compte.role === ROLE_SUPERADMIN ? null : compte;
}

export function verifierRole(acteur: UtilisateurConnecte, ...roles: readonly Role[]): void {
  if (!roles.includes(acteur.role)) {
    throw new AccesRefuseError();
  }
}

export function verifierAccesCentre(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutAccederAuCentre(acteur, centreId)) {
    throw new AccesRefuseError();
  }
}

/** Un périmètre fourni par l'appelant n'est jamais cru sur parole. */
export function verifierPerimetre(acteur: UtilisateurConnecte, perimetre: Perimetre): void {
  if (perimetre.type === 'tous') {
    if (!peutChoisirTousLesCentres(acteur.role)) {
      throw new AccesRefuseError();
    }
  } else {
    verifierAccesCentre(acteur, perimetre.centreId);
  }
}

export interface CentreSelectionnable {
  readonly id: string;
  readonly nom: string;
}

/** Centres actifs que l'utilisateur peut choisir comme centre courant, triés par nom. */
export async function centresSelectionnables(
  acteur: UtilisateurConnecte,
): Promise<CentreSelectionnable[]> {
  return base(acteur).centre.findMany({
    where: {
      organisationId: acteur.organisationId,
      actif: true,
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { id: { in: [...acteur.centreIds] } }),
    },
    select: { id: true, nom: true },
    orderBy: { nom: 'asc' },
  });
}

/** Résout la valeur du cookie « centre courant » (non fiable) en périmètre autorisé. */
export async function resoudrePerimetreActeur(
  acteur: UtilisateurConnecte,
  choix: string | undefined,
): Promise<{ perimetre: Perimetre; centres: CentreSelectionnable[] }> {
  const centres = await centresSelectionnables(acteur);
  const perimetre = resoudrePerimetre(
    acteur,
    choix,
    centres.map((c) => c.id),
  );
  return { perimetre, centres };
}
