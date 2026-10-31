import {
  differencesAuditees,
  parametresReservationSchema,
  PARAMETRES_RESERVATION_DEFAUT,
  peutGererAgenda,
  type ParametresReservationSaisie,
  type ValidationReservation,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { traduireDoublon, valider } from '../erreurs';

export interface ParametresReservationCentre {
  actif: boolean;
  delaiMinimalMinutes: number;
  horizonJours: number;
  validation: ValidationReservation;
  delaiModificationHeures: number;
  slug: string;
  slugClient: string;
  /** Types que le client déclare réservables, avec le choix de ce centre. */
  types: { id: string; nom: string; retenu: boolean }[];
}

function verifierGestion(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutGererAgenda(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

/** Réglages de la réservation en ligne d'un centre, ou ceux par défaut s'il ne l'a jamais ouverte. */
export async function lireParametresReservation(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<ParametresReservationCentre> {
  verifierGestion(acteur, centreId);
  const client = base(acteur);
  const [centre, organisation, parametres, types, retenus] = await Promise.all([
    client.centre.findFirst({ where: { id: centreId }, select: { slug: true } }),
    client.organisation.findFirst({ select: { slug: true } }),
    client.parametresReservation.findUnique({ where: { centreId } }),
    client.typeRdv.findMany({
      where: { actif: true, reservableEnLigne: true },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    }),
    client.typeRdvEnLigne.findMany({ where: { centreId }, select: { typeRdvId: true } }),
  ]);
  if (!centre || !organisation) {
    throw new AccesRefuseError();
  }
  const ids = new Set(retenus.map((r) => r.typeRdvId));
  const { actif, delaiMinimalMinutes, horizonJours, validation, delaiModificationHeures } =
    parametres ?? PARAMETRES_RESERVATION_DEFAUT;
  return {
    actif,
    delaiMinimalMinutes,
    horizonJours,
    validation,
    delaiModificationHeures,
    slug: centre.slug,
    slugClient: organisation.slug,
    types: types.map((t) => ({ ...t, retenu: ids.has(t.id) })),
  };
}

const MESSAGES_DOUBLON = {
  centre_organisation_id_slug_key: ['slug', 'Un autre centre utilise déjà cette adresse.'],
} as const;

function instantaneParametres(
  p: Omit<ParametresReservationSaisie, 'typeRdvIds'> & {
    typeRdvIds: readonly string[];
  },
) {
  return { ...p, typeRdvIds: [...p.typeRdvIds].sort() };
}

/** Enregistre les réglages. Seuls les types réservables du client peuvent être retenus. */
export async function enregistrerParametresReservation(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  verifierGestion(acteur, centreId);
  const d = valider(parametresReservationSchema, saisie);
  const { typeRdvIds, slug, ...reglages } = d;
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const centre = await tx.centre.findFirst({
          where: { id: centreId },
          select: { slug: true },
        });
        if (!centre) {
          throw new AccesRefuseError();
        }
        const avant = await tx.parametresReservation.findUnique({ where: { centreId } });
        const retenus = await tx.typeRdvEnLigne.findMany({
          where: { centreId },
          select: { typeRdvId: true },
        });
        const eligibles = await tx.typeRdv.findMany({
          where: { id: { in: typeRdvIds }, actif: true, reservableEnLigne: true },
          select: { id: true },
        });
        await tx.parametresReservation.upsert({
          where: { centreId },
          create: { centreId, ...reglages },
          update: reglages,
        });
        await tx.typeRdvEnLigne.deleteMany({ where: { centreId } });
        await tx.typeRdvEnLigne.createMany({
          data: eligibles.map((t) => ({ centreId, typeRdvId: t.id })),
        });
        if (centre.slug !== slug) {
          await tx.centre.update({ where: { id: centreId }, data: { slug } });
        }
        return {
          avant: avant && {
            actif: avant.actif,
            delaiMinimalMinutes: avant.delaiMinimalMinutes,
            horizonJours: avant.horizonJours,
            validation: avant.validation,
            delaiModificationHeures: avant.delaiModificationHeures,
            slug: centre.slug,
            typeRdvIds: retenus.map((r) => r.typeRdvId),
          },
          apres: { ...reglages, slug, typeRdvIds: eligibles.map((t) => t.id) },
        };
      },
      ({ avant, apres }) => ({
        action: avant ? 'UPDATE' : 'CREATE',
        entiteType: 'PARAMETRES_RESERVATION',
        entiteId: centreId,
        centreId,
        champs: differencesAuditees(
          'PARAMETRES_RESERVATION',
          avant ? instantaneParametres(avant) : null,
          instantaneParametres(apres),
        ),
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Cette adresse est déjà utilisée.');
  }
}
