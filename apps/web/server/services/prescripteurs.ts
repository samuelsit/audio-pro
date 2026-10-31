import type { Prisma } from '@ha/db';
import {
  calculerPagination,
  criteresRecherchePrescripteurSchema,
  differencesAuditees,
  motsDeRecherche,
  normaliserPourRecherche,
  prescripteurSaisieSchema,
  type Pagination,
  type PrescripteurSaisie,
  type SpecialitePrescripteur,
} from '@ha/domain';

import { base } from '../chiffrement';
import { AccesRefuseError, verifierRole, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { traduireDoublon, valider } from '../erreurs';

export const LIGNES_PAR_PAGE = 50;
const SUGGESTIONS_MAX = 8;

export interface PrescripteurResume {
  id: string;
  nom: string;
  prenom: string;
  rpps: string | null;
  specialite: SpecialitePrescripteur;
  formationOtologie: boolean | null;
  cabinet: string | null;
  contact: string | null;
  actif: boolean;
}

const selection = {
  id: true,
  nom: true,
  prenom: true,
  rpps: true,
  specialite: true,
  formationOtologie: true,
  cabinet: true,
  contact: true,
  actif: true,
} as const;

const MESSAGES_DOUBLON = {
  prescripteur_organisation_id_rpps_key: [
    'rpps',
    'Ce numéro RPPS est déjà enregistré pour un autre prescripteur.',
  ],
} as const;

/** Chaque mot doit se retrouver dans le nom, le prénom ou le RPPS, dans n'importe quel ordre. */
function filtreRecherche(acteur: UtilisateurConnecte, q: string): Prisma.PrescripteurWhereInput {
  return {
    organisationId: acteur.organisationId,
    AND: motsDeRecherche(q).map((mot) => ({
      OR: [
        { nomRecherche: { contains: mot } },
        { prenomRecherche: { contains: mot } },
        { rpps: { startsWith: mot } },
      ],
    })),
  };
}

export async function listerPrescripteurs(
  acteur: UtilisateurConnecte,
  parametres: unknown,
): Promise<{
  prescripteurs: PrescripteurResume[];
  pagination: Pagination;
  q: string;
}> {
  const { q, page } = valider(criteresRecherchePrescripteurSchema, parametres);
  const where = {
    ...filtreRecherche(acteur, q),
    ...(acteur.role === 'ADMIN_CLIENT' ? {} : { actif: true }),
  };
  const total = await base(acteur).prescripteur.count({ where });
  const pagination = calculerPagination(page, LIGNES_PAR_PAGE, total);
  const prescripteurs = await base(acteur).prescripteur.findMany({
    where,
    select: selection,
    orderBy: [{ nomRecherche: 'asc' }, { prenomRecherche: 'asc' }, { id: 'asc' }],
    skip: pagination.decalage,
    take: pagination.parPage,
  });
  return { prescripteurs, pagination, q };
}

/** Recherche rapide : prescripteurs actifs, pour le sélecteur d'un dossier. */
export async function rechercherPrescripteurs(
  acteur: UtilisateurConnecte,
  saisie: string,
): Promise<PrescripteurResume[]> {
  const { q } = valider(criteresRecherchePrescripteurSchema, { q: saisie });
  if (q === '') {
    return [];
  }
  return base(acteur).prescripteur.findMany({
    where: { ...filtreRecherche(acteur, q), actif: true },
    select: selection,
    orderBy: [{ nomRecherche: 'asc' }, { prenomRecherche: 'asc' }],
    take: SUGGESTIONS_MAX,
  });
}

export async function obtenirPrescripteur(
  acteur: UtilisateurConnecte,
  prescripteurId: string,
): Promise<PrescripteurResume> {
  const p = await base(acteur).prescripteur.findFirst({
    where: { id: prescripteurId, organisationId: acteur.organisationId },
    select: selection,
  });
  if (!p) {
    throw new AccesRefuseError();
  }
  return p;
}

function colonnes(donnees: PrescripteurSaisie) {
  return {
    ...donnees,
    nomRecherche: normaliserPourRecherche(donnees.nom),
    prenomRecherche: normaliserPourRecherche(donnees.prenom),
  };
}

/** Création depuis l'écran Prescripteurs ou à la volée depuis un dossier : ouverte aux 3 rôles. */
export async function creerPrescripteur(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<PrescripteurResume> {
  const donnees = valider(prescripteurSaisieSchema, saisie);
  try {
    return await withAudit(
      acteur,
      (tx) =>
        tx.prescripteur.create({
          data: { ...colonnes(donnees), organisationId: acteur.organisationId },
          select: selection,
        }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'PRESCRIPTEUR',
        entiteId: cree.id,
        champs: differencesAuditees('PRESCRIPTEUR', null, donnees),
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce prescripteur existe déjà.');
  }
}

export async function modifierPrescripteur(
  acteur: UtilisateurConnecte,
  prescripteurId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const actuel = await obtenirPrescripteur(acteur, prescripteurId);
  const donnees = valider(prescripteurSaisieSchema, saisie);
  try {
    await withAudit(
      acteur,
      (tx) => tx.prescripteur.update({ where: { id: prescripteurId }, data: colonnes(donnees) }),
      {
        action: 'UPDATE',
        entiteType: 'PRESCRIPTEUR',
        entiteId: prescripteurId,
        champs: differencesAuditees(
          'PRESCRIPTEUR',
          {
            nom: actuel.nom,
            prenom: actuel.prenom,
            rpps: actuel.rpps,
            specialite: actuel.specialite,
            formationOtologie: actuel.formationOtologie,
            cabinet: actuel.cabinet,
            contact: actuel.contact,
          },
          donnees,
        ),
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce prescripteur existe déjà.');
  }
}

export async function changerActivationPrescripteur(
  acteur: UtilisateurConnecte,
  prescripteurId: string,
  actif: boolean,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const actuel = await obtenirPrescripteur(acteur, prescripteurId);
  await withAudit(
    acteur,
    (tx) => tx.prescripteur.update({ where: { id: prescripteurId }, data: { actif } }),
    {
      action: 'UPDATE',
      entiteType: 'PRESCRIPTEUR',
      entiteId: prescripteurId,
      champs: differencesAuditees('PRESCRIPTEUR', { actif: actuel.actif }, { actif }),
    },
  );
}
