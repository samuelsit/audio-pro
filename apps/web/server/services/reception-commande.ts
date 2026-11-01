import { SystemClock } from '@ha/adapters';
import {
  ecartsDuPointage,
  motifCommandeSchema,
  peutApprouverCommande,
  peutDemanderCommande,
  pointageSaisieSchema,
  receptionPossible,
  resteARecevoir,
  type Clock,
  type EcartReception,
  type PointageSaisie,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import type { ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { appliquerStatut, verrouillerCommande } from './commandes';
import { receptionnerDansTransaction } from './reception';

const horloge: Clock = new SystemClock();

function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

type LigneLue = Awaited<ReturnType<typeof verrouillerCommande>>['lignes'][number];

interface LignePointee {
  readonly ligne: LigneLue;
  readonly pointage: PointageSaisie['lignes'][number];
  readonly quantite: number;
}

/** Résout chaque pointage sur sa ligne. La quantité d'un appareil vient de ses numéros de série. */
function lignesPointees(
  lignes: readonly LigneLue[],
  saisie: PointageSaisie['lignes'],
): LignePointee[] {
  const pointees: LignePointee[] = [];
  for (const pointage of saisie) {
    const ligne = lignes.find((l) => l.id === pointage.ligneId);
    if (!ligne) {
      throw new AccesRefuseError();
    }
    if (ligne.modeleId === null && pointage.numerosSerie.length > 0) {
      throw ErreurSaisie.surChamp('lignes', 'Un accessoire n’a pas de numéro de série.');
    }
    if (ligne.modeleId !== null && pointage.quantite > 0) {
      throw ErreurSaisie.surChamp('lignes', 'Saisir les numéros de série des appareils reçus.');
    }
    const quantite = ligne.modeleId === null ? pointage.quantite : pointage.numerosSerie.length;
    if (quantite + pointage.quantiteNonConforme > 0) {
      pointees.push({ ligne, pointage, quantite });
    }
  }
  if (pointees.length === 0) {
    throw ErreurSaisie.surChamp('lignes', 'Pointer au moins une ligne.');
  }
  return pointees;
}

async function ecrireEcarts(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  commande: { id: string; centreId: string },
  receptionId: string,
  { ligne, pointage, quantite }: LignePointee,
): Promise<readonly EcartReception[]> {
  const ecarts = ecartsDuPointage(ligne, {
    quantite,
    quantiteNonConforme: pointage.quantiteNonConforme,
  });
  for (const ecart of ecarts) {
    await tx.ecartAchat.create({
      data: {
        ...ecart,
        organisationId: acteur.organisationId,
        centreId: commande.centreId,
        commandeId: commande.id,
        commandeLigneId: ligne.id,
        receptionId,
        commentaire: pointage.commentaire,
      },
    });
  }
  return ecarts;
}

/** Une facture peut précéder la livraison : ce que la livraison explique n'est plus un écart. */
async function leverEcartsDeFacture(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  ligne: { id: string; quantiteRecue: number; quantiteFacturee: number },
  appareils: readonly { numeroSerie: string }[],
): Promise<void> {
  const traitement = {
    statut: 'RESOLU' as const,
    traiteParId: acteur.id,
    traiteLe: new Date(horloge.now()),
  };
  if (ligne.quantiteFacturee <= ligne.quantiteRecue) {
    await tx.ecartAchat.updateMany({
      where: { commandeLigneId: ligne.id, type: 'QUANTITE_FACTUREE', statut: 'OUVERT' },
      data: traitement,
    });
  }
  await tx.ecartAchat.updateMany({
    where: {
      commandeLigneId: ligne.id,
      type: 'SERIE_INCONNUE',
      statut: 'OUVERT',
      numeroSerie: { in: appareils.map((a) => a.numeroSerie) },
    },
    data: traitement,
  });
}

/**
 * Pointe une livraison, ligne à ligne, dans une seule transaction : un numéro de série refusé annule tout. Un
 * produit non conforme n'entre pas en stock ; un surplus y entre, l'écart se traite ensuite.
 */
export async function pointerReception(
  acteur: UtilisateurConnecte,
  commandeId: string,
  saisie: unknown,
): Promise<string> {
  if (!peutDemanderCommande(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(pointageSaisieSchema, saisie);
  const { receptionId } = await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (!receptionPossible(commande.statut)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande n’attend pas de livraison.');
      }
      const pointees = lignesPointees(commande.lignes, donnees.lignes);
      const appareils = pointees.filter((p) => p.pointage.numerosSerie.length > 0);
      const accessoires = pointees.filter((p) => p.ligne.accessoireId !== null && p.quantite > 0);
      const stock =
        appareils.length + accessoires.length === 0
          ? { appareilsParEntree: [], evenements: [] }
          : await receptionnerDansTransaction(tx, acteur, {
              centreId: commande.centreId,
              dateReception: donnees.dateReception,
              referenceBonLivraison: donnees.referenceBonLivraison,
              referenceFactureFabricant: null,
              commandeId,
              appareils: appareils.map(({ ligne, pointage }) => ({
                modeleId: ligne.modeleId ?? '',
                numerosSerie: pointage.numerosSerie,
                prixAchatCentimes: ligne.prixAchatCentimes,
                enConsignation: ligne.enConsignation,
              })),
              accessoires: accessoires.map(({ ligne, quantite }) => ({
                accessoireId: ligne.accessoireId ?? '',
                quantite,
                motif: `Réception de la commande ${commande.numero}`,
              })),
            });

      const { id } = await tx.reception.create({
        data: {
          organisationId: acteur.organisationId,
          commandeId,
          centreId: commande.centreId,
          dateReception: versDate(donnees.dateReception),
          referenceBonLivraison: donnees.referenceBonLivraison,
          acteurId: acteur.id,
        },
        select: { id: true },
      });
      const lignes = commande.lignes.map((l) => ({ ...l }));
      let ecarts = 0;
      for (const pointee of pointees) {
        const { ligne, pointage, quantite } = pointee;
        const { id: receptionLigneId } = await tx.receptionLigne.create({
          data: {
            organisationId: acteur.organisationId,
            receptionId: id,
            commandeLigneId: ligne.id,
            quantite,
            quantiteNonConforme: pointage.quantiteNonConforme,
          },
          select: { id: true },
        });
        const crees = stock.appareilsParEntree[appareils.indexOf(pointee)] ?? [];
        await tx.receptionLigneAppareil.createMany({
          data: crees.map((a) => ({
            organisationId: acteur.organisationId,
            receptionLigneId,
            appareilId: a.id,
          })),
        });
        ecarts += (await ecrireEcarts(tx, acteur, commande, id, pointee)).length;
        await tx.commandeLigne.update({
          where: { id: ligne.id },
          data: { quantiteRecue: { increment: quantite } },
        });
        const suivie = lignes.find((l) => l.id === ligne.id);
        if (suivie) {
          suivie.quantiteRecue += quantite;
          await leverEcartsDeFacture(tx, acteur, suivie, crees);
        }
      }
      const statut = await appliquerStatut(tx, commandeId, commande.statut, lignes);
      const patients = pointees.flatMap(({ ligne }) =>
        ligne.patientId === null ? [] : [ligne.patientId],
      );
      const evenements: EvenementAudit[] = [
        ...stock.evenements,
        {
          action: 'CREATE',
          entiteType: 'RECEPTION_COMMANDE',
          entiteId: id,
          centreId: commande.centreId,
          details: { commandeId, statut, lignes: pointees.length, ecarts },
        },
        ...[...new Set(patients)].map((patientId): EvenementAudit => ({
          action: 'UPDATE',
          entiteType: 'COMMANDE',
          entiteId: commandeId,
          centreId: commande.centreId,
          patientId,
          details: { receptionId: id },
        })),
      ];
      return { receptionId: id, evenements };
    },
    ({ evenements }) => evenements,
  );
  return receptionId;
}

/** Solde le reste attendu d'une ligne : le fabricant ne livrera pas. Le manque est consigné, avec son motif. */
export async function abandonnerReliquat(
  acteur: UtilisateurConnecte,
  commandeId: string,
  ligneId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutApprouverCommande(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { motif } = valider(motifCommandeSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      verifierAccesCentre(acteur, commande.centreId);
      const ligne = commande.lignes.find((l) => l.id === ligneId);
      if (!ligne) {
        throw new AccesRefuseError();
      }
      const reste = resteARecevoir(ligne);
      if (commande.statut !== 'PARTIELLEMENT_RECUE' || reste === 0) {
        throw ErreurSaisie.surChamp('statut', 'Rien à abandonner sur cette ligne.');
      }
      await tx.commandeLigne.update({
        where: { id: ligneId },
        data: { quantiteAbandonnee: { increment: reste } },
      });
      await tx.ecartAchat.create({
        data: {
          organisationId: acteur.organisationId,
          centreId: commande.centreId,
          commandeId,
          commandeLigneId: ligneId,
          type: 'QUANTITE_MANQUANTE',
          statut: 'ACCEPTE',
          quantiteAttendue: reste,
          quantiteConstatee: 0,
          commentaire: motif,
          traiteParId: acteur.id,
          traiteLe: new Date(horloge.now()),
        },
      });
      await appliquerStatut(
        tx,
        commandeId,
        commande.statut,
        commande.lignes.map((l) =>
          l.id === ligneId ? { ...l, quantiteAbandonnee: l.quantiteAbandonnee + reste } : l,
        ),
      );
      return { centreId: commande.centreId, reste };
    },
    ({ centreId, reste }) => ({
      action: 'UPDATE',
      entiteType: 'COMMANDE',
      entiteId: commandeId,
      centreId,
      details: { reliquatAbandonne: reste, ligneId },
    }),
  );
}
