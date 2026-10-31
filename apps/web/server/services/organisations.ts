import { clientPlateforme, type Prisma } from '@ha/db';
import {
  differencesAuditees,
  motDePasseSchema,
  nomAffiche,
  organisationSaisieSchema,
  ROLE_SUPERADMIN,
  slugDepuisNom,
  slugDisponible,
  statutClientSchema,
  type StatutOrganisation,
  TYPES_RDV_DEFAUT,
} from '@ha/domain';
import { hashPassword } from 'better-auth/crypto';

import { withAuditPlateforme } from '../audit/journal';
import { AccesRefuseError, type SuperadminConnecte } from '../auth/acces';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { identifiants } from './compte';

// Console éditeur. Le rôle plateforme ne lit que les clients et leurs comptes, aucune donnée patient.

/** Un acteur de la console n'est jamais cru sur son type : le rôle est revérifié. */
function verifierSuperadmin(acteur: SuperadminConnecte): void {
  if (acteur.role !== ROLE_SUPERADMIN) {
    throw new AccesRefuseError();
  }
}

export interface OrganisationResume {
  id: string;
  raisonSociale: string;
  siren: string | null;
  statut: StatutOrganisation;
  centres: number;
  utilisateurs: number;
  createdAt: Date;
}

export async function listerOrganisations(
  acteur: SuperadminConnecte,
): Promise<OrganisationResume[]> {
  verifierSuperadmin(acteur);
  const lignes = await clientPlateforme().organisation.findMany({
    select: {
      id: true,
      raisonSociale: true,
      siren: true,
      statut: true,
      createdAt: true,
      _count: { select: { centres: true, utilisateurs: true } },
    },
    orderBy: { raisonSociale: 'asc' },
  });
  return lignes.map(({ _count, ...ligne }) => ({
    ...ligne,
    centres: _count.centres,
    utilisateurs: _count.utilisateurs,
  }));
}

const MESSAGES_DOUBLON = {
  organisation_siren_key: ['siren', 'Un client existe déjà avec ce SIREN.'],
  organisation_slug_key: ['raisonSociale', 'Un client vient d’être créé avec ce nom. Réessayez.'],
  utilisateur_email_key: ['adminEmail', 'Un compte existe déjà avec cette adresse e-mail.'],
} as const;

/** Crée un client et son premier ADMIN_CLIENT, qui changera son mot de passe à la connexion. */
export async function creerOrganisation(
  acteur: SuperadminConnecte,
  saisie: unknown,
  motDePasseInitial: unknown,
): Promise<string> {
  verifierSuperadmin(acteur);
  const { adminPrenom, adminNom, adminEmail, ...organisation } = valider(
    organisationSaisieSchema,
    saisie,
  );
  const motDePasse = motDePasseSchema.safeParse(motDePasseInitial);
  if (!motDePasse.success) {
    throw ErreurSaisie.surChamp('motDePasse', motDePasse.error.issues[0]?.message ?? '');
  }
  const hash = await hashPassword(motDePasse.data);
  try {
    return await withAuditPlateforme(
      acteur,
      async (tx) => {
        const nom = slugDepuisNom(organisation.raisonSociale, 'client');
        const pris = await tx.organisation.findMany({
          where: { slug: { startsWith: nom } },
          select: { slug: true },
        });
        const slug = slugDisponible(nom, new Set(pris.map((o) => o.slug)));
        const { id } = await tx.organisation.create({
          data: { ...organisation, slug },
          select: { id: true },
        });
        const admin = await tx.utilisateur.create({
          data: {
            organisationId: id,
            prenom: adminPrenom,
            nom: adminNom,
            name: nomAffiche(adminPrenom, adminNom),
            email: adminEmail,
            role: 'ADMIN_CLIENT',
            doitChangerMotDePasse: true,
          },
          select: { id: true },
        });
        await tx.compte.create({ data: identifiants(admin.id, hash) });
        await tx.typeRdv.createMany({
          data: TYPES_RDV_DEFAUT.map((type) => ({ ...type, organisationId: id })),
        });
        return id;
      },
      (id) => id,
      (id) => ({
        action: 'CREATE',
        entiteType: 'ORGANISATION',
        entiteId: id,
        champs: differencesAuditees('ORGANISATION', null, organisation),
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce client existe déjà.');
  }
}

/** `depuis` : statuts d'où ce changement part. Renvoie `false` s'il n'a rien changé. */
async function changerStatut(
  acteur: SuperadminConnecte,
  organisationId: string,
  statut: StatutOrganisation,
  depuis: readonly StatutOrganisation[],
  apresChangement: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<boolean> {
  verifierSuperadmin(acteur);
  const { change } = await withAuditPlateforme(
    acteur,
    async (tx) => {
      const avant = await tx.organisation.findUnique({
        where: { id: organisationId },
        select: { statut: true },
      });
      if (!avant) {
        throw new AccesRefuseError();
      }
      // Conditionnée au statut lu : de deux actions simultanées, une seule aboutit.
      const { count } = depuis.includes(avant.statut)
        ? await tx.organisation.updateMany({
            where: { id: organisationId, statut: avant.statut },
            data: { statut },
          })
        : { count: 0 };
      if (count > 0) {
        await apresChangement(tx);
      }
      return { avant, change: count > 0 };
    },
    () => organisationId,
    ({ avant, change: aChange }) =>
      aChange
        ? {
            action: 'UPDATE',
            entiteType: 'ORGANISATION',
            entiteId: organisationId,
            champs: differencesAuditees('ORGANISATION', avant, { statut }),
          }
        : null,
  );
  return change;
}

/** Suspend un client : plus de connexion, et ses sessions ouvertes tombent tout de suite. */
export async function suspendreOrganisation(
  acteur: SuperadminConnecte,
  organisationId: string,
): Promise<boolean> {
  return changerStatut(acteur, organisationId, 'SUSPENDU', ['ESSAI', 'ACTIF'], (tx) =>
    tx.session.deleteMany({ where: { utilisateur: { organisationId } } }),
  );
}

/**
 * Réactive un client suspendu, en essai ou actif : le statut d'avant la suspension n'est pas conservé.
 * Renvoie `false` pour un client qui ne l'est plus : une page restée ouverte ne le rétrograde pas.
 */
export async function reactiverOrganisation(
  acteur: SuperadminConnecte,
  organisationId: string,
  statut: unknown,
): Promise<boolean> {
  verifierSuperadmin(acteur);
  const cible = valider(statutClientSchema, statut);
  return changerStatut(acteur, organisationId, cible, ['SUSPENDU'], async () => undefined);
}
