import { clientPlateforme, type Prisma } from '@ha/db';
import {
  differencesAuditees,
  motDePasseSchema,
  nomAffiche,
  organisationSaisieSchema,
  ROLE_SUPERADMIN,
  type StatutOrganisation,
} from '@ha/domain';
import { hashPassword } from 'better-auth/crypto';

import { auteurDepuisActeur, journaliser } from '../audit/journal';
import { AccesRefuseError, type SuperadminConnecte } from '../auth/acces';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';

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
    return await clientPlateforme().$transaction(async (tx) => {
      const { id } = await tx.organisation.create({ data: organisation, select: { id: true } });
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
      await tx.compte.create({
        data: { accountId: admin.id, providerId: 'credential', userId: admin.id, password: hash },
      });
      await journaliser(
        tx,
        { ...auteurDepuisActeur(acteur), organisationId: id },
        {
          action: 'CREATE',
          entiteType: 'ORGANISATION',
          entiteId: id,
          champs: differencesAuditees('ORGANISATION', null, organisation),
        },
      );
      return id;
    });
  } catch (erreur) {
    traduireDoublon(erreur, MESSAGES_DOUBLON, 'Ce client existe déjà.');
  }
}

async function changerStatut(
  acteur: SuperadminConnecte,
  organisationId: string,
  statut: StatutOrganisation,
  apresChangement: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<void> {
  verifierSuperadmin(acteur);
  await clientPlateforme().$transaction(async (tx) => {
    const avant = await tx.organisation.findUnique({
      where: { id: organisationId },
      select: { statut: true },
    });
    if (!avant) {
      throw new AccesRefuseError();
    }
    if (avant.statut === statut) {
      return;
    }
    await tx.organisation.update({ where: { id: organisationId }, data: { statut } });
    await apresChangement(tx);
    await journaliser(
      tx,
      { ...auteurDepuisActeur(acteur), organisationId },
      {
        action: 'UPDATE',
        entiteType: 'ORGANISATION',
        entiteId: organisationId,
        champs: differencesAuditees('ORGANISATION', avant, { statut }),
      },
    );
  });
}

/** Suspend un client : plus de connexion, et ses sessions ouvertes tombent tout de suite. */
export async function suspendreOrganisation(
  acteur: SuperadminConnecte,
  organisationId: string,
): Promise<void> {
  await changerStatut(acteur, organisationId, 'SUSPENDU', (tx) =>
    tx.session.deleteMany({ where: { utilisateur: { organisationId } } }),
  );
}

export async function reactiverOrganisation(
  acteur: SuperadminConnecte,
  organisationId: string,
): Promise<void> {
  await changerStatut(acteur, organisationId, 'ACTIF', async () => undefined);
}
