import { prisma, type Prisma } from '@ha/db';
import {
  centresExerciceHorsRattachement,
  motDePasseSchema,
  nomAffiche,
  peutAccederAuCentre,
  peutEtrePraticien,
  utilisateurSaisieSchema,
  type Perimetre,
  type Role,
} from '@ha/domain';
import { hashPassword } from 'better-auth/crypto';

import {
  AccesRefuseError,
  verifierPerimetre,
  verifierRole,
  type UtilisateurConnecte,
} from '../auth/acces';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { filtreParCentre } from '../perimetre';

export interface UtilisateurResume {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
  deuxFacteursActif: boolean;
  /** Centres de rattachement visibles par l'acteur (les autres ne sont pas révélés). */
  centres: { id: string; nom: string }[];
}

export interface UtilisateurDetail extends UtilisateurResume {
  centreIds: string[];
  estPraticien: boolean;
}

const selectionUtilisateur = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  role: true,
  actif: true,
  twoFactorEnabled: true,
  centres: { select: { centre: { select: { id: true, nom: true } } } },
  praticien: { select: { id: true, centres: { select: { centreId: true } } } },
} as const;

type LigneUtilisateur = Prisma.UtilisateurGetPayload<{ select: typeof selectionUtilisateur }>;

function versResume(acteur: UtilisateurConnecte, u: LigneUtilisateur): UtilisateurResume {
  return {
    id: u.id,
    prenom: u.prenom,
    nom: u.nom,
    email: u.email,
    role: u.role,
    actif: u.actif,
    deuxFacteursActif: u.twoFactorEnabled,
    centres: u.centres
      .map((uc) => uc.centre)
      .filter((c) => peutAccederAuCentre(acteur, c.id))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}

/**
 * Utilisateurs rattachés à un centre du périmètre. Avec « Tous les centres » (ADMIN), tous les
 * comptes de l'organisation, y compris les ADMIN (non rattachés). Seul l'ADMIN voit les comptes inactifs.
 */
export async function listerUtilisateurs(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<UtilisateurResume[]> {
  verifierPerimetre(acteur, perimetre);
  const centres = filtreParCentre(acteur, perimetre);
  const lignes = await prisma().utilisateur.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(acteur.role === 'ADMIN' ? {} : { actif: true }),
      ...(centres ? { centres } : {}),
    },
    select: selectionUtilisateur,
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });
  return lignes.map((u) => versResume(acteur, u));
}

export async function obtenirUtilisateur(
  acteur: UtilisateurConnecte,
  utilisateurId: string,
): Promise<UtilisateurDetail> {
  verifierRole(acteur, 'ADMIN');
  const u = await prisma().utilisateur.findFirst({
    where: { id: utilisateurId, organisationId: acteur.organisationId },
    select: selectionUtilisateur,
  });
  if (!u) {
    throw new AccesRefuseError();
  }
  return {
    ...versResume(acteur, u),
    centreIds: u.centres.map((uc) => uc.centre.id),
    estPraticien: u.praticien !== null,
  };
}

async function verifierCentresDeLOrganisation(
  acteur: UtilisateurConnecte,
  centreIds: readonly string[],
): Promise<void> {
  const trouves = await prisma().centre.count({
    where: { id: { in: [...centreIds] }, organisationId: acteur.organisationId },
  });
  if (trouves !== centreIds.length) {
    throw ErreurSaisie.surChamp('centreIds', 'Centre inconnu.');
  }
}

const MESSAGES_DOUBLON = {
  utilisateur_email_key: ['email', 'Un compte existe déjà avec cette adresse e-mail.'],
} as const;

/** Crée un compte avec un mot de passe initial, à changer à la première connexion. */
export async function creerUtilisateur(
  acteur: UtilisateurConnecte,
  saisie: unknown,
  motDePasseInitial: unknown,
): Promise<string> {
  verifierRole(acteur, 'ADMIN');
  const donnees = valider(utilisateurSaisieSchema, saisie);
  const resultatMdp = motDePasseSchema.safeParse(motDePasseInitial);
  if (!resultatMdp.success) {
    throw ErreurSaisie.surChamp('motDePasse', resultatMdp.error.issues[0]?.message ?? '');
  }
  await verifierCentresDeLOrganisation(acteur, donnees.centreIds);
  const hash = await hashPassword(resultatMdp.data);
  try {
    const cree = await prisma().$transaction(async (tx) => {
      const u = await tx.utilisateur.create({
        data: {
          organisationId: acteur.organisationId,
          prenom: donnees.prenom,
          nom: donnees.nom,
          name: nomAffiche(donnees.prenom, donnees.nom),
          email: donnees.email,
          role: donnees.role,
          actif: donnees.actif,
          doitChangerMotDePasse: true,
          centres: { create: donnees.centreIds.map((centreId) => ({ centreId })) },
        },
        select: { id: true },
      });
      await tx.compte.create({
        data: { accountId: u.id, providerId: 'credential', userId: u.id, password: hash },
      });
      return u;
    });
    return cree.id;
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce compte existe déjà.');
  }
}

export async function modifierUtilisateur(
  acteur: UtilisateurConnecte,
  utilisateurId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN');
  const actuel = await obtenirUtilisateur(acteur, utilisateurId);
  const donnees = valider(utilisateurSaisieSchema, saisie);
  await verifierCentresDeLOrganisation(acteur, donnees.centreIds);

  if (utilisateurId === acteur.id && (donnees.role !== 'ADMIN' || !donnees.actif)) {
    throw new ErreurSaisie(
      {},
      'Vous ne pouvez pas retirer votre propre rôle administrateur ni désactiver votre compte.',
    );
  }
  if (actuel.estPraticien) {
    if (!peutEtrePraticien(donnees.role)) {
      throw ErreurSaisie.surChamp(
        'role',
        'Cet utilisateur a une fiche praticien : son rôle doit rester Audioprothésiste.',
      );
    }
    const praticien = await prisma().praticien.findUniqueOrThrow({
      where: { utilisateurId },
      select: { centres: { select: { centreId: true } } },
    });
    const orphelins = centresExerciceHorsRattachement(
      praticien.centres.map((c) => c.centreId),
      donnees.centreIds,
    );
    if (orphelins.length > 0) {
      throw ErreurSaisie.surChamp(
        'centreIds',
        'Retirer d’abord ces centres des centres d’exercice du praticien.',
      );
    }
  }

  try {
    await prisma().$transaction(async (tx) => {
      await tx.utilisateur.update({
        where: { id: utilisateurId },
        data: {
          prenom: donnees.prenom,
          nom: donnees.nom,
          name: nomAffiche(donnees.prenom, donnees.nom),
          email: donnees.email,
          role: donnees.role,
          actif: donnees.actif,
        },
      });
      await tx.utilisateurCentre.deleteMany({
        where: { utilisateurId, centreId: { notIn: donnees.centreIds } },
      });
      await tx.utilisateurCentre.createMany({
        data: donnees.centreIds.map((centreId) => ({ utilisateurId, centreId })),
        skipDuplicates: true,
      });
      if (!donnees.actif) {
        await tx.session.deleteMany({ where: { userId: utilisateurId } });
      }
    });
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce compte existe déjà.');
  }
}

/** Fixe un nouveau mot de passe provisoire et ferme toutes les sessions de l'utilisateur. */
export async function reinitialiserMotDePasse(
  acteur: UtilisateurConnecte,
  utilisateurId: string,
  nouveauMotDePasse: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN');
  await obtenirUtilisateur(acteur, utilisateurId);
  const resultat = motDePasseSchema.safeParse(nouveauMotDePasse);
  if (!resultat.success) {
    throw ErreurSaisie.surChamp('motDePasse', resultat.error.issues[0]?.message ?? '');
  }
  const hash = await hashPassword(resultat.data);
  await prisma().$transaction([
    prisma().compte.updateMany({
      where: { userId: utilisateurId, providerId: 'credential' },
      data: { password: hash },
    }),
    prisma().utilisateur.update({
      where: { id: utilisateurId },
      data: { doitChangerMotDePasse: true },
    }),
    prisma().session.deleteMany({ where: { userId: utilisateurId } }),
  ]);
}
