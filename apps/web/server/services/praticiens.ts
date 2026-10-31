import type { Prisma } from '@ha/db';
import {
  centresExerciceHorsRattachement,
  differencesAuditees,
  peutAccederAuCentre,
  peutEtrePraticien,
  praticienSaisieSchema,
  type Perimetre,
} from '@ha/domain';

import { base } from '../chiffrement';
import {
  AccesRefuseError,
  verifierPerimetre,
  verifierRole,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit } from '../audit/journal';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { filtreParCentre } from '../perimetre';

export interface PraticienResume {
  id: string;
  utilisateurId: string;
  prenom: string;
  nom: string;
  rpps: string;
  adeli: string | null;
  actif: boolean;
  /** Centres d'exercice visibles par l'acteur. */
  centres: { id: string; nom: string }[];
}

export interface PraticienDetail extends PraticienResume {
  centreIds: string[];
}

const selectionPraticien = {
  id: true,
  utilisateurId: true,
  rpps: true,
  adeli: true,
  utilisateur: { select: { prenom: true, nom: true, actif: true } },
  centres: { select: { centre: { select: { id: true, nom: true } } } },
} as const;

type LignePraticien = Prisma.PraticienGetPayload<{ select: typeof selectionPraticien }>;

function versResume(acteur: UtilisateurConnecte, p: LignePraticien): PraticienResume {
  return {
    id: p.id,
    utilisateurId: p.utilisateurId,
    prenom: p.utilisateur.prenom,
    nom: p.utilisateur.nom,
    rpps: p.rpps,
    adeli: p.adeli,
    actif: p.utilisateur.actif,
    centres: p.centres
      .map((pc) => pc.centre)
      .filter((c) => peutAccederAuCentre(acteur, c.id))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}

/** Praticiens exerçant dans un centre du périmètre (inactifs visibles par l'ADMIN_CLIENT seulement). */
export async function listerPraticiens(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<PraticienResume[]> {
  verifierPerimetre(acteur, perimetre);
  const centres = filtreParCentre(acteur, perimetre);
  const lignes = await base(acteur).praticien.findMany({
    where: {
      utilisateur: {
        organisationId: acteur.organisationId,
        ...(acteur.role === 'ADMIN_CLIENT' ? {} : { actif: true }),
      },
      ...(centres ? { centres } : {}),
    },
    select: selectionPraticien,
    orderBy: [{ utilisateur: { nom: 'asc' } }, { utilisateur: { prenom: 'asc' } }],
  });
  return lignes.map((p) => versResume(acteur, p));
}

export async function obtenirPraticien(
  acteur: UtilisateurConnecte,
  praticienId: string,
): Promise<PraticienDetail> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const p = await base(acteur).praticien.findFirst({
    where: { id: praticienId, utilisateur: { organisationId: acteur.organisationId } },
    select: selectionPraticien,
  });
  if (!p) {
    throw new AccesRefuseError();
  }
  return { ...versResume(acteur, p), centreIds: p.centres.map((pc) => pc.centre.id) };
}

/** Utilisateurs AUDIO sans fiche praticien, proposés à la création d'une fiche. */
export async function listerAudiosSansFiche(
  acteur: UtilisateurConnecte,
): Promise<{ id: string; prenom: string; nom: string }[]> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  return base(acteur).utilisateur.findMany({
    where: { organisationId: acteur.organisationId, role: 'AUDIO', praticien: null },
    select: { id: true, prenom: true, nom: true },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });
}

/** Contrôle l'utilisateur cible et ses centres d'exercice ; renvoie la saisie validée. */
async function validerSaisie(acteur: UtilisateurConnecte, saisie: unknown) {
  const donnees = valider(praticienSaisieSchema, saisie);
  const utilisateur = await base(acteur).utilisateur.findFirst({
    where: { id: donnees.utilisateurId, organisationId: acteur.organisationId },
    select: { role: true, centres: { select: { centreId: true } } },
  });
  if (!utilisateur) {
    throw ErreurSaisie.surChamp('utilisateurId', 'Utilisateur inconnu.');
  }
  if (!peutEtrePraticien(utilisateur.role)) {
    throw ErreurSaisie.surChamp(
      'utilisateurId',
      'Seul un utilisateur de rôle Audioprothésiste peut avoir une fiche praticien.',
    );
  }
  const horsRattachement = centresExerciceHorsRattachement(
    donnees.centreIds,
    utilisateur.centres.map((c) => c.centreId),
  );
  if (horsRattachement.length > 0) {
    throw ErreurSaisie.surChamp(
      'centreIds',
      'Les centres d’exercice doivent faire partie des centres de rattachement de l’utilisateur.',
    );
  }
  return donnees;
}

const MESSAGES_DOUBLON = {
  praticien_organisation_id_rpps_key: [
    'rpps',
    'Ce numéro RPPS est déjà enregistré pour un autre praticien.',
  ],
  praticien_organisation_id_adeli_key: [
    'adeli',
    'Ce numéro ADELI est déjà enregistré pour un autre praticien.',
  ],
  praticien_utilisateur_id_key: ['utilisateurId', 'Cet utilisateur a déjà une fiche praticien.'],
} as const;

export async function creerPraticien(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const donnees = await validerSaisie(acteur, saisie);
  try {
    const p = await withAudit(
      acteur,
      (tx) =>
        tx.praticien.create({
          data: {
            utilisateurId: donnees.utilisateurId,
            rpps: donnees.rpps,
            adeli: donnees.adeli,
            centres: { create: donnees.centreIds.map((centreId) => ({ centreId })) },
          },
          select: { id: true },
        }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'PRATICIEN',
        entiteId: cree.id,
        champs: differencesAuditees('PRATICIEN', null, donnees),
      }),
    );
    return p.id;
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce praticien existe déjà.');
  }
}

/** Modifie RPPS, ADELI et centres d'exercice. L'utilisateur lié ne change pas. */
export async function modifierPraticien(
  acteur: UtilisateurConnecte,
  praticienId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const actuel = await obtenirPraticien(acteur, praticienId);
  const donnees = await validerSaisie(acteur, {
    ...(typeof saisie === 'object' ? saisie : {}),
    utilisateurId: actuel.utilisateurId,
  });
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const rdvAVenir = await tx.rendezVous.count({
          where: {
            praticienId,
            centreId: { notIn: donnees.centreIds },
            debut: { gte: new Date() },
            statut: { in: ['PLANIFIE', 'CONFIRME'] },
          },
        });
        if (rdvAVenir > 0) {
          throw ErreurSaisie.surChamp(
            'centreIds',
            'Ce praticien a des rendez-vous à venir sur un centre retiré.',
          );
        }
        await tx.praticien.update({
          where: { id: praticienId },
          data: { rpps: donnees.rpps, adeli: donnees.adeli },
        });
        await tx.praticienCentre.deleteMany({
          where: { praticienId, centreId: { notIn: donnees.centreIds } },
        });
        await tx.praticienCentre.createMany({
          data: donnees.centreIds.map((centreId) => ({ praticienId, centreId })),
          skipDuplicates: true,
        });
      },
      {
        action: 'UPDATE',
        entiteType: 'PRATICIEN',
        entiteId: praticienId,
        champs: differencesAuditees(
          'PRATICIEN',
          { rpps: actuel.rpps, adeli: actuel.adeli, centreIds: actuel.centreIds },
          { rpps: donnees.rpps, adeli: donnees.adeli, centreIds: donnees.centreIds },
        ),
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce praticien existe déjà.');
  }
}
