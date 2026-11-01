import { SystemClock } from '@ha/adapters';
import {
  calculerPagination,
  ecartTraitable,
  filtreEcartsSchema,
  peutGererAchats,
  traitementEcartSchema,
  type Clock,
  type FiltreEcarts,
  type Pagination,
  type Perimetre,
  type StatutEcartAchat,
  type TypeEcartAchat,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';

const horloge: Clock = new SystemClock();
const LIGNES_PAR_PAGE = 50;

export interface EcartListe {
  id: string;
  type: TypeEcartAchat;
  statut: StatutEcartAchat;
  centre: string;
  commandeId: string | null;
  commande: string | null;
  quantiteAttendue: number | null;
  quantiteConstatee: number | null;
  montantAttenduCentimes: number | null;
  montantConstateCentimes: number | null;
  numeroSerie: string | null;
  commentaire: string | null;
  createdAt: Date;
}

export interface ListeEcarts {
  lignes: EcartListe[];
  pagination: Pagination;
  filtre: FiltreEcarts;
}

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererAchats(acteur.role)) {
    throw new AccesRefuseError();
  }
}

export async function listerEcarts(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeEcarts> {
  exigerGestion(acteur);
  verifierPerimetre(acteur, perimetre);
  const filtre = valider(filtreEcartsSchema, saisie);
  const centres = centresDuPerimetre(acteur, perimetre);
  const where = {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    ...(filtre.statut ? { statut: filtre.statut } : {}),
    ...(filtre.type ? { type: filtre.type } : {}),
  };
  const client = base(acteur);
  const total = await client.ecartAchat.count({ where });
  const pagination = calculerPagination(filtre.page, LIGNES_PAR_PAGE, total);
  const lignes = await client.ecartAchat.findMany({
    where,
    orderBy: { id: 'desc' },
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE,
    select: {
      id: true,
      type: true,
      statut: true,
      commandeId: true,
      quantiteAttendue: true,
      quantiteConstatee: true,
      montantAttenduCentimes: true,
      montantConstateCentimes: true,
      numeroSerie: true,
      commentaire: true,
      createdAt: true,
      centre: { select: { nom: true } },
      commande: { select: { numero: true } },
    },
  });
  return {
    lignes: lignes.map((l) => ({
      ...l,
      centre: l.centre.nom,
      commande: l.commande?.numero ?? null,
    })),
    pagination,
    filtre,
  };
}

/** Accepter, contester ou résoudre, toujours avec un commentaire. Un écart traité ne se rouvre pas. */
export async function traiterEcart(
  acteur: UtilisateurConnecte,
  ecartId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const { statut, commentaire } = valider(traitementEcartSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const ecart = await tx.ecartAchat.findFirst({
        where: { id: ecartId, organisationId: acteur.organisationId },
        select: { statut: true, centreId: true, type: true },
      });
      if (!ecart) {
        throw new AccesRefuseError();
      }
      verifierAccesCentre(acteur, ecart.centreId);
      if (!ecartTraitable(ecart.statut)) {
        throw ErreurSaisie.surChamp('statut', 'Cet écart est déjà traité.');
      }
      await tx.ecartAchat.update({
        where: { id: ecartId },
        data: { statut, commentaire, traiteParId: acteur.id, traiteLe: new Date(horloge.now()) },
      });
      return ecart;
    },
    (ecart) => ({
      action: 'UPDATE',
      entiteType: 'ECART_ACHAT',
      entiteId: ecartId,
      centreId: ecart.centreId,
      details: { type: ecart.type, statut },
    }),
  );
}
