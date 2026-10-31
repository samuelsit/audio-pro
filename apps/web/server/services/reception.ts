import { SystemClock } from '@ha/adapters';
import {
  dateReceptionValide,
  differencesAuditees,
  peutVoirPrixAchat,
  receptionEntreeSchema,
  receptionSaisieSchema,
  type Clock,
  type ReceptionEntree,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import type { ClientTransaction } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import {
  crediter,
  ecrireMouvementAccessoire,
  lireModeleActif,
  verifierAccessoire,
  verifierCentreActif,
} from './stock';

const horloge: Clock = new SystemClock();

const DOUBLON_APPAREIL = {
  appareil_fabricant_id_numero_serie_key: [
    'numerosSerie',
    'Un numéro de série existe déjà chez ce fabricant.',
  ],
} as const;

function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export interface ResultatReception {
  readonly appareilIds: readonly string[];
  /** À journaliser par l'appelant, dans la transaction qu'il a ouverte. */
  readonly evenements: readonly EvenementAudit[];
}

/**
 * Enregistre une livraison dans la transaction de l'appelant : le prompt 17 y ajoutera la mise à jour de sa
 * commande. Tout ou rien : si un numéro est refusé, l'erreur liste chaque numéro en cause. Le contrôle du droit
 * de saisir un prix reste au formulaire, car un prix de commande n'est pas une saisie de l'utilisateur.
 */
export async function receptionnerDansTransaction(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  saisie: ReceptionEntree,
): Promise<ResultatReception> {
  const entree = valider(receptionEntreeSchema, saisie);
  const { centreId, commandeId, dateReception } = entree;
  verifierAccesCentre(acteur, centreId);
  if (!dateReceptionValide(dateReception, horloge.now().slice(0, 10))) {
    throw ErreurSaisie.surChamp('dateReception', 'La date de réception ne peut pas être future.');
  }
  await verifierCentreActif(tx, acteur, centreId, 'centreId');

  const appareilIds: string[] = [];
  const evenements: EvenementAudit[] = [];
  for (const { modeleId, numerosSerie, prixAchatCentimes, enConsignation } of entree.appareils) {
    const modele = await lireModeleActif(tx, acteur, modeleId);
    const existants = await tx.appareil.findMany({
      where: { fabricantId: modele.fabricantId, numeroSerie: { in: numerosSerie } },
      select: { numeroSerie: true },
      orderBy: { numeroSerie: 'asc' },
    });
    if (existants.length > 0) {
      throw new ErreurSaisie({
        numerosSerie: existants.map((a) => `Déjà enregistré chez ce fabricant : ${a.numeroSerie}.`),
      });
    }
    let crees: { id: string; numeroSerie: string }[];
    try {
      crees = await tx.appareil.createManyAndReturn({
        data: numerosSerie.map((numeroSerie) => ({
          centreId,
          modeleId,
          numeroSerie,
          organisationId: acteur.organisationId,
          fabricantId: modele.fabricantId,
          dateReception: versDate(dateReception),
          referenceBonLivraison: entree.referenceBonLivraison,
          referenceFactureFabricant: entree.referenceFactureFabricant,
          prixAchatCentimes,
          enConsignation,
        })),
        select: { id: true, numeroSerie: true },
      });
    } catch (erreur) {
      traduireDoublon(erreur, DOUBLON_APPAREIL, 'Un numéro de série existe déjà.');
    }
    await tx.mouvementAppareil.createMany({
      data: crees.map((a) => ({
        organisationId: acteur.organisationId,
        appareilId: a.id,
        type: 'RECEPTION' as const,
        utilisateurId: acteur.id,
        statutApres: 'EN_STOCK' as const,
        centreApresId: centreId,
        commandeId,
      })),
    });
    for (const a of crees) {
      appareilIds.push(a.id);
      evenements.push({
        action: 'CREATE',
        entiteType: 'APPAREIL',
        entiteId: a.id,
        centreId,
        champs: differencesAuditees('APPAREIL', null, {
          numeroSerie: a.numeroSerie,
          modeleId,
          referenceBonLivraison: entree.referenceBonLivraison,
          referenceFactureFabricant: entree.referenceFactureFabricant,
          enConsignation,
        }),
        details: { mouvement: 'RECEPTION' },
      });
    }
  }
  for (const { accessoireId, quantite, motif } of entree.accessoires) {
    await verifierAccessoire(tx, acteur, accessoireId);
    const operation = { centreId, accessoireId, quantite, motif, commandeId };
    const quantiteApres = await crediter(tx, operation);
    evenements.push(
      await ecrireMouvementAccessoire(tx, acteur, 'ENTREE', operation, quantiteApres),
    );
  }
  return { appareilIds, evenements };
}

/** Réception autonome, dans sa propre transaction. */
export async function receptionner(
  acteur: UtilisateurConnecte,
  saisie: ReceptionEntree,
): Promise<ResultatReception> {
  return withAudit(
    acteur,
    (tx) => receptionnerDansTransaction(tx, acteur, saisie),
    ({ evenements }) => evenements,
  );
}

/** Formulaire de réception : un modèle, un prix saisi en euros. */
export async function recevoirAppareils(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string[]> {
  const donnees = valider(receptionSaisieSchema, saisie);
  verifierAccesCentre(acteur, donnees.centreId);
  if (donnees.prixAchatCentimes !== null && !peutVoirPrixAchat(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { appareilIds } = await receptionner(acteur, {
    centreId: donnees.centreId,
    dateReception: donnees.dateReception,
    referenceBonLivraison: donnees.referenceBonLivraison,
    referenceFactureFabricant: donnees.referenceFactureFabricant,
    commandeId: null,
    appareils: [
      {
        modeleId: donnees.modeleId,
        numerosSerie: donnees.numerosSerie,
        prixAchatCentimes: donnees.prixAchatCentimes,
        enConsignation: donnees.enConsignation,
      },
    ],
    accessoires: [],
  });
  return [...appareilIds];
}
