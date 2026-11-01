import {
  peutGererFournisseurs,
  regleCommandeSaisieSchema,
  type DecisionRegle,
  type RegleCommandeSaisie,
  type TypeProduitCommande,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';

export interface RegleCommandeVue {
  id: string;
  libelle: string;
  priorite: number;
  montantMaxCentimes: number | null;
  typeProduit: TypeProduitCommande | null;
  fournisseurId: string | null;
  fournisseur: string | null;
  centreId: string | null;
  centre: string | null;
  decision: DecisionRegle;
  actif: boolean;
}

const selection = {
  id: true,
  libelle: true,
  priorite: true,
  montantMaxCentimes: true,
  typeProduit: true,
  fournisseurId: true,
  centreId: true,
  decision: true,
  actif: true,
  fournisseur: { select: { nom: true } },
  centre: { select: { nom: true } },
} as const;

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererFournisseurs(acteur.role)) {
    throw new AccesRefuseError();
  }
}

function evenementRegle(
  action: EvenementAudit['action'],
  id: string,
  s: RegleCommandeSaisie,
): EvenementAudit {
  return { action, entiteType: 'REGLE_COMMANDE', entiteId: id, details: { ...s } };
}

async function verifierLiens(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  { fournisseurId, centreId }: RegleCommandeSaisie,
): Promise<void> {
  const { organisationId } = acteur;
  if (
    fournisseurId !== null &&
    !(await tx.fournisseur.findFirst({
      where: { id: fournisseurId, organisationId },
      select: { id: true },
    }))
  ) {
    throw ErreurSaisie.surChamp('fournisseurId', 'Fournisseur inconnu.');
  }
  if (
    centreId !== null &&
    !(await tx.centre.findFirst({ where: { id: centreId, organisationId }, select: { id: true } }))
  ) {
    throw ErreurSaisie.surChamp('centreId', 'Centre inconnu.');
  }
}

export async function listerReglesCommande(
  acteur: UtilisateurConnecte,
): Promise<RegleCommandeVue[]> {
  const lignes = await base(acteur).regleCommande.findMany({
    where: { organisationId: acteur.organisationId },
    select: selection,
    orderBy: [{ actif: 'desc' }, { priorite: 'asc' }, { id: 'asc' }],
  });
  return lignes.map((l) => ({
    ...l,
    fournisseur: l.fournisseur?.nom ?? null,
    centre: l.centre?.nom ?? null,
  }));
}

export async function obtenirRegleCommande(
  acteur: UtilisateurConnecte,
  regleId: string,
): Promise<RegleCommandeVue> {
  const regle = (await listerReglesCommande(acteur)).find((r) => r.id === regleId);
  if (!regle) {
    throw new AccesRefuseError();
  }
  return regle;
}

export async function creerRegleCommande(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  exigerGestion(acteur);
  const donnees = valider(regleCommandeSaisieSchema, saisie);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      await verifierLiens(tx, acteur, donnees);
      return tx.regleCommande.create({
        data: { ...donnees, organisationId: acteur.organisationId },
        select: { id: true },
      });
    },
    (creee) => evenementRegle('CREATE', creee.id, donnees),
  );
  return id;
}

/** Une règle se désactive sans se supprimer : les commandes gardent celle qui a décidé de leur envoi. */
export async function modifierRegleCommande(
  acteur: UtilisateurConnecte,
  regleId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const donnees = valider(regleCommandeSaisieSchema, saisie);
  await obtenirRegleCommande(acteur, regleId);
  await withAudit(
    acteur,
    async (tx) => {
      await verifierLiens(tx, acteur, donnees);
      await tx.regleCommande.update({ where: { id: regleId }, data: donnees });
    },
    evenementRegle('UPDATE', regleId, donnees),
  );
}
