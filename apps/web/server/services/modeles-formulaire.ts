import { randomUUID } from 'node:crypto';

import type { Prisma } from '@ha/db';
import {
  definitionFormulaireSchema,
  MODELES_PAR_DEFAUT,
  modeleFormulaireSaisieSchema,
  peutGererModelesFormulaire,
  type DefinitionFormulaire,
  type NatureFormulaire,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { traduireDoublon, valider } from '../erreurs';
import type { Client } from './patients';

export interface ModeleFormulaireLu {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly nature: NatureFormulaire;
  readonly nom: string;
  readonly actif: boolean;
  readonly definition: DefinitionFormulaire;
}

const selectionModele = {
  id: true,
  code: true,
  version: true,
  nature: true,
  nom: true,
  actif: true,
  definition: true,
} as const;

function lu(ligne: Prisma.ModeleFormulaireGetPayload<{ select: typeof selectionModele }>) {
  return { ...ligne, definition: definitionFormulaireSchema.parse(ligne.definition) };
}

export async function lireModele(
  client: Client,
  acteur: UtilisateurConnecte,
  modeleId: string,
): Promise<ModeleFormulaireLu> {
  const ligne = await client.modeleFormulaire.findFirst({
    where: { id: modeleId, organisationId: acteur.organisationId },
    select: selectionModele,
  });
  if (!ligne) {
    throw new AccesRefuseError();
  }
  return lu(ligne);
}

/** Modèles proposés à la saisie. Une réponse existante garde sa version, même désactivée. */
export async function modelesActifs(
  client: Client,
  acteur: UtilisateurConnecte,
): Promise<ModeleFormulaireLu[]> {
  const lignes = await client.modeleFormulaire.findMany({
    where: { organisationId: acteur.organisationId, actif: true },
    orderBy: [{ nature: 'asc' }, { nom: 'asc' }],
    select: selectionModele,
  });
  return lignes.map(lu);
}

/** Copie les modèles livrés au premier bilan du client. Idempotent : une relance ne touche à rien. */
export async function assurerModelesParDefaut(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
): Promise<void> {
  const { organisationId } = acteur;
  const nombre = await tx.modeleFormulaire.count({ where: { organisationId } });
  if (nombre > 0) {
    return;
  }
  await tx.modeleFormulaire.createMany({
    data: MODELES_PAR_DEFAUT.map(({ code, nature, nom, definition }) => ({
      organisationId,
      code,
      version: 1,
      nature,
      nom,
      definition,
    })),
    skipDuplicates: true,
  });
}

function verifierGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererModelesFormulaire(acteur.role)) {
    throw new AccesRefuseError();
  }
}

/** Dernière version de chaque modèle du client, pour l'écran d'administration. */
export async function listerModeles(acteur: UtilisateurConnecte): Promise<ModeleFormulaireLu[]> {
  verifierGestion(acteur);
  const lignes = await base(acteur).modeleFormulaire.findMany({
    where: { organisationId: acteur.organisationId },
    orderBy: { version: 'desc' },
    select: selectionModele,
  });
  const derniers = new Map<string, ModeleFormulaireLu>();
  for (const ligne of lignes) {
    if (!derniers.has(ligne.code)) {
      derniers.set(ligne.code, lu(ligne));
    }
  }
  return [...derniers.values()].sort(
    (a, b) => a.nature.localeCompare(b.nature) || a.nom.localeCompare(b.nom, 'fr'),
  );
}

export async function obtenirModele(
  acteur: UtilisateurConnecte,
  code: string,
): Promise<ModeleFormulaireLu | null> {
  verifierGestion(acteur);
  const ligne = await base(acteur).modeleFormulaire.findFirst({
    where: { organisationId: acteur.organisationId, code },
    orderBy: { version: 'desc' },
    select: selectionModele,
  });
  return ligne && lu(ligne);
}

function evenementModele(id: string, version: number, nature: NatureFormulaire): EvenementAudit {
  return {
    action: version === 1 ? 'CREATE' : 'UPDATE',
    entiteType: 'MODELE_FORMULAIRE',
    entiteId: id,
    details: { version, nature },
  };
}

/**
 * Crée un modèle, ou une nouvelle version de `code` : les réponses déjà saisies restent liées à la leur.
 * La nature d'un modèle existant ne change pas : ses réponses n'ont de sens que pour elle.
 */
export async function enregistrerModele(
  acteur: UtilisateurConnecte,
  code: string | null,
  saisie: unknown,
): Promise<string> {
  verifierGestion(acteur);
  const donnees = valider(modeleFormulaireSaisieSchema, saisie);
  const { organisationId } = acteur;
  try {
    return await withAudit(
      acteur,
      async (tx) => {
        const courant =
          code === null
            ? null
            : await tx.modeleFormulaire.findFirst({
                where: { organisationId, code },
                orderBy: { version: 'desc' },
                select: { version: true, nature: true },
              });
        if (code !== null && courant === null) {
          throw new AccesRefuseError();
        }
        const cree = await tx.modeleFormulaire.create({
          data: {
            organisationId,
            code: code ?? randomUUID(),
            version: (courant?.version ?? 0) + 1,
            nature: courant?.nature ?? donnees.nature,
            nom: donnees.nom,
            definition: donnees.definition,
            createdById: acteur.id,
          },
          select: { id: true, code: true, version: true, nature: true },
        });
        await tx.modeleFormulaire.updateMany({
          where: { organisationId, code: cree.code, id: { not: cree.id } },
          data: { actif: false },
        });
        return cree;
      },
      ({ id, version, nature }) => evenementModele(id, version, nature),
    ).then(({ code: codeCree }) => codeCree);
  } catch (erreur) {
    traduireDoublon(erreur, {}, 'Ce modèle vient d’être modifié : rechargez la page.');
  }
}

/** Retire un modèle des propositions, ou le rétablit dans sa dernière version. */
export async function basculerModele(
  acteur: UtilisateurConnecte,
  code: string,
  actif: boolean,
): Promise<void> {
  verifierGestion(acteur);
  const { organisationId } = acteur;
  await withAudit(
    acteur,
    async (tx) => {
      const dernier = await tx.modeleFormulaire.findFirst({
        where: { organisationId, code },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      });
      if (!dernier) {
        throw new AccesRefuseError();
      }
      await tx.modeleFormulaire.update({ where: { id: dernier.id }, data: { actif } });
      return dernier;
    },
    ({ id }) => ({
      action: 'UPDATE',
      entiteType: 'MODELE_FORMULAIRE',
      entiteId: id,
      details: { actif },
    }),
  );
}
