import { prisma } from '@ha/db';
import { centreSaisieSchema, differencesAuditees, type Perimetre } from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  verifierRole,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit } from '../audit/journal';
import { traduireDoublon, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';

export interface CentreDetail {
  id: string;
  nom: string;
  adresseLigne1: string;
  adresseLigne2: string | null;
  codePostal: string;
  ville: string;
  finess: string | null;
  numeroFacturationAm: string | null;
  email: string;
  telephone: string;
  actif: boolean;
}

const selectionCentre = {
  id: true,
  nom: true,
  adresseLigne1: true,
  adresseLigne2: true,
  codePostal: true,
  ville: true,
  finess: true,
  numeroFacturationAm: true,
  email: true,
  telephone: true,
  actif: true,
} as const;

/** Centres du périmètre courant (inactifs compris pour l'ADMIN). */
export async function listerCentres(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<CentreDetail[]> {
  verifierPerimetre(acteur, perimetre);
  const ids = centresDuPerimetre(acteur, perimetre);
  return prisma().centre.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(ids === null ? {} : { id: { in: [...ids] } }),
      ...(acteur.role === 'ADMIN' ? {} : { actif: true }),
    },
    select: selectionCentre,
    orderBy: { nom: 'asc' },
  });
}

export async function obtenirCentre(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<CentreDetail> {
  verifierAccesCentre(acteur, centreId);
  const centre = await prisma().centre.findFirst({
    where: { id: centreId, organisationId: acteur.organisationId },
    select: selectionCentre,
  });
  if (!centre || (!centre.actif && acteur.role !== 'ADMIN')) {
    throw new AccesRefuseError();
  }
  return centre;
}

const MESSAGES_DOUBLON = {
  centre_organisation_id_nom_key: ['nom', 'Un centre porte déjà ce nom.'],
  centre_finess_key: ['finess', 'Ce numéro FINESS est déjà utilisé par un autre centre.'],
  centre_numero_facturation_am_key: [
    'numeroFacturationAm',
    'Ce numéro de facturation est déjà utilisé par un autre centre.',
  ],
} as const;

export async function creerCentre(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  verifierRole(acteur, 'ADMIN');
  const donnees = valider(centreSaisieSchema, saisie);
  try {
    return await withAudit(
      acteur,
      async (tx) => {
        const centre = await tx.centre.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        });
        return centre.id;
      },
      (id) => ({
        action: 'CREATE',
        entiteType: 'CENTRE',
        entiteId: id,
        centreId: id,
        champs: differencesAuditees('CENTRE', null, donnees),
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce centre existe déjà.');
  }
}

export async function modifierCentre(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN');
  const { id, ...avant } = await obtenirCentre(acteur, centreId);
  const donnees = valider(centreSaisieSchema, saisie);
  try {
    await withAudit(acteur, (tx) => tx.centre.update({ where: { id }, data: donnees }), {
      action: 'UPDATE',
      entiteType: 'CENTRE',
      entiteId: id,
      centreId: id,
      champs: differencesAuditees('CENTRE', avant, donnees),
    });
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce centre existe déjà.');
  }
}
