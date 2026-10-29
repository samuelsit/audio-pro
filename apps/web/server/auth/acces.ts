import { prisma } from '@ha/db';
import {
  peutAccederAuCentre,
  resoudrePerimetre,
  type Perimetre,
  type ProfilAcces,
  type Role,
} from '@ha/domain';

/** Utilisateur authentifié, rechargé depuis la base à chaque requête. */
export interface UtilisateurConnecte extends ProfilAcces {
  readonly id: string;
  readonly organisationId: string;
  readonly prenom: string;
  readonly nom: string;
  readonly email: string;
  readonly twoFactorEnabled: boolean;
  readonly doitChangerMotDePasse: boolean;
}

/** Refus d'accès. Le message reste générique : on ne révèle pas l'existence d'une ressource. */
export class AccesRefuseError extends Error {
  constructor() {
    super('Accès refusé.');
    this.name = 'AccesRefuseError';
  }
}

/** Charge l'utilisateur et ses rattachements à des centres actifs ; `null` s'il est absent ou désactivé. */
export async function chargerUtilisateurConnecte(
  utilisateurId: string,
): Promise<UtilisateurConnecte | null> {
  const u = await prisma().utilisateur.findUnique({
    where: { id: utilisateurId },
    include: { centres: { where: { centre: { actif: true } }, select: { centreId: true } } },
  });
  if (!u?.actif) {
    return null;
  }
  return {
    id: u.id,
    organisationId: u.organisationId,
    prenom: u.prenom,
    nom: u.nom,
    email: u.email,
    role: u.role,
    centreIds: u.centres.map((c) => c.centreId),
    twoFactorEnabled: u.twoFactorEnabled,
    doitChangerMotDePasse: u.doitChangerMotDePasse,
  };
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
    verifierRole(acteur, 'ADMIN');
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
  return prisma().centre.findMany({
    where: {
      organisationId: acteur.organisationId,
      actif: true,
      ...(acteur.role === 'ADMIN' ? {} : { id: { in: [...acteur.centreIds] } }),
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
