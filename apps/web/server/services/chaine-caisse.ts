import { chargerSignatureCaisse, HacheurSha256, SystemClock } from '@ha/adapters';
import {
  ajouterMaillon as ajouterMaillonChaine,
  verifierCentre,
  type ContexteChaine,
  type DepsCaisse,
  type MaillonAAjouter,
  type MaillonEcrit,
  type TxCaisse,
} from '@ha/caisse';
import type { ResultatChaine, SignatureCaisse } from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { base, enTransaction, type ClientTransaction } from '../chiffrement';

export { chargeDepuisBase, type LigneChainee, type PieceChainee } from '@ha/caisse';

export const hacheur = new HacheurSha256();
const horloge = new SystemClock();

let signature: SignatureCaisse | undefined;

/** Clé de signature des clôtures et archives. Obligatoire en production, simulée sinon. */
export function signatureCaisse(): SignatureCaisse {
  signature ??= chargerSignatureCaisse(process.env);
  return signature;
}

export function contexteChaine(acteur: UtilisateurConnecte): ContexteChaine {
  return { organisationId: acteur.organisationId, acteurId: acteur.id, horloge, hacheur };
}

/** Le client chiffré a les mêmes tables qu'une transaction Prisma : seule son extension change. */
export function txCaisse(tx: ClientTransaction): TxCaisse {
  return tx as unknown as TxCaisse;
}

export function depsCaisse(acteur: UtilisateurConnecte): DepsCaisse {
  return {
    ...contexteChaine(acteur),
    signature: signatureCaisse(),
    transaction: (operation) => enTransaction(acteur, (tx) => operation(txCaisse(tx))),
  };
}

export function ajouterMaillon(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  maillon: MaillonAAjouter,
): Promise<MaillonEcrit> {
  return ajouterMaillonChaine(txCaisse(tx), contexteChaine(acteur), maillon);
}

/**
 * Vérifie la chaîne d'un centre : voir `verifierCentre`. Une ligne de facture modifiée en base rompt donc la
 * vérification, même si le journal est intact.
 */
export async function verifierChaineCaisse(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<ResultatChaine> {
  verifierAccesCentre(acteur, centreId);
  const client = base(acteur);
  // Un centre d'un autre client ne rend aucune ligne sous la RLS : une chaîne vide ne prouverait rien.
  const centre = await client.centre.findUnique({ where: { id: centreId }, select: { id: true } });
  if (!centre) {
    throw new AccesRefuseError();
  }
  return verifierCentre(client as unknown as TxCaisse, centreId, {
    hacheur,
    signature: signatureCaisse(),
  });
}
