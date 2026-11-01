import type { Prisma } from '@ha/db';
import {
  centreSaisieSchema,
  differencesAuditees,
  HORAIRES_VIDES,
  horairesOuvertureSchema,
  slugDepuisNom,
  slugDisponible,
  type HorairesOuverture,
  type Perimetre,
} from '@ha/domain';

import { base } from '../chiffrement';
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
import { ajouterMaillon } from './chaine-caisse';

export interface CentreDetail {
  id: string;
  nom: string;
  adresseLigne1: string;
  adresseLigne2: string | null;
  codePostal: string;
  ville: string;
  finess: string | null;
  numeroFacturationAm: string | null;
  raisonSociale: string | null;
  siret: string | null;
  rcs: string | null;
  tvaIntracommunautaire: string | null;
  email: string;
  telephone: string;
  horairesOuverture: HorairesOuverture;
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
  raisonSociale: true,
  siret: true,
  rcs: true,
  tvaIntracommunautaire: true,
  email: true,
  telephone: true,
  horairesOuverture: true,
  actif: true,
} as const;

type LigneCentre = Prisma.CentreGetPayload<{ select: typeof selectionCentre }>;

function versCentre(ligne: LigneCentre): CentreDetail {
  return {
    ...ligne,
    horairesOuverture: horairesOuvertureSchema.parse(ligne.horairesOuverture ?? HORAIRES_VIDES),
  };
}

/** Centres du périmètre courant (inactifs compris pour l'ADMIN_CLIENT). */
export async function listerCentres(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<CentreDetail[]> {
  verifierPerimetre(acteur, perimetre);
  const ids = centresDuPerimetre(acteur, perimetre);
  const centres = await base(acteur).centre.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(ids === null ? {} : { id: { in: [...ids] } }),
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { actif: true }),
    },
    select: selectionCentre,
    orderBy: { nom: 'asc' },
  });
  return centres.map(versCentre);
}

export async function obtenirCentre(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<CentreDetail> {
  verifierAccesCentre(acteur, centreId);
  const centre = await base(acteur).centre.findFirst({
    where: { id: centreId, organisationId: acteur.organisationId },
    select: selectionCentre,
  });
  if (!centre || (!centre.actif && acteur.role !== 'ADMIN_CLIENT')) {
    throw new AccesRefuseError();
  }
  return versCentre(centre);
}

const MESSAGES_DOUBLON = {
  centre_organisation_id_nom_key: ['nom', 'Un centre porte déjà ce nom.'],
  centre_organisation_id_finess_key: [
    'finess',
    'Ce numéro FINESS est déjà utilisé par un autre centre.',
  ],
  centre_organisation_id_numero_facturation_am_key: [
    'numeroFacturationAm',
    'Ce numéro de facturation est déjà utilisé par un autre centre.',
  ],
} as const;

export async function creerCentre(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const donnees = valider(centreSaisieSchema, saisie);
  try {
    return await withAudit(
      acteur,
      async (tx) => {
        const pris = await tx.centre.findMany({ select: { slug: true } });
        const slug = slugDisponible(
          slugDepuisNom(donnees.nom, 'centre'),
          new Set(pris.map((c) => c.slug)),
        );
        const centre = await tx.centre.create({
          data: { ...donnees, slug, organisationId: acteur.organisationId },
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

const CHAMPS_IDENTITE = ['raisonSociale', 'siret', 'rcs', 'tvaIntracommunautaire'] as const;

/** Identité imprimée sur les pièces : un changement passe au journal de caisse, avec l'avant et l'après. */
function differencesIdentite(
  avant: Readonly<Record<(typeof CHAMPS_IDENTITE)[number], string | null>>,
  apres: Readonly<Record<(typeof CHAMPS_IDENTITE)[number], string | null>>,
) {
  return CHAMPS_IDENTITE.filter((champ) => avant[champ] !== apres[champ]).map((champ) => ({
    champ,
    avant: avant[champ],
    apres: apres[champ],
  }));
}

export async function modifierCentre(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const { id, ...avant } = await obtenirCentre(acteur, centreId);
  const donnees = valider(centreSaisieSchema, saisie);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        await tx.centre.update({ where: { id }, data: donnees });
        const identite = differencesIdentite(avant, donnees);
        if (identite.length > 0) {
          await ajouterMaillon(tx, acteur, {
            centreId: id,
            type: 'PARAMETRE_MODIFIE',
            charge: { parametre: 'IDENTITE_ENTREPRISE', champs: identite },
          });
        }
      },
      {
        action: 'UPDATE',
        entiteType: 'CENTRE',
        entiteId: id,
        centreId: id,
        champs: differencesAuditees('CENTRE', avant, donnees),
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce centre existe déjà.');
  }
}
