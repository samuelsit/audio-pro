import { randomUUID } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import {
  accuseSaisieSchema,
  ErreurDocumentIntrouvable,
  peutVoirPrixAchat,
  rendreBonCommandeHtml,
  type BonCommandeVue,
  type Clock,
  type ParametresCommandeMessage,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { journaliser, withAudit, type AuteurAudit } from '../audit/journal';
import { base, enTransaction, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider } from '../erreurs';
import { notifierDisponible } from '../notifier';
import { rendeurPdf } from '../pdf';
import { signatureLienCommande } from '../reservation-empreintes';
import { aujourdhui } from './patients';
import { verrouillerCommande } from './commandes';

const horloge: Clock = new SystemClock();
const NOM_BON = 'bon-de-commande.pdf';

/** Le fournisseur ne se connecte pas : le journal note l'origine, pas une personne. */
function auteurLien(organisationId: string): AuteurAudit {
  return { utilisateurId: null, libelle: 'Lien d’accusé', role: null, organisationId };
}

async function vueDuBon(
  client: ReturnType<typeof base>,
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<BonCommandeVue> {
  const commande = await client.commande.findFirst({
    where: { id: commandeId, organisationId: acteur.organisationId },
    select: {
      numero: true,
      createdAt: true,
      fournisseurId: true,
      centreId: true,
      organisation: { select: { raisonSociale: true } },
      centre: {
        select: {
          nom: true,
          siret: true,
          adresseLigne1: true,
          adresseLigne2: true,
          codePostal: true,
          ville: true,
          telephone: true,
          email: true,
        },
      },
      fournisseur: {
        select: {
          nom: true,
          adresse: true,
          comptes: { select: { centreId: true, numeroClient: true } },
        },
      },
      lignes: {
        select: {
          quantite: true,
          prixAchatCentimes: true,
          referencePatient: true,
          oreille: true,
          modele: {
            select: {
              gamme: true,
              nom: true,
              referenceCommerciale: true,
              fabricant: { select: { nom: true } },
            },
          },
          accessoire: { select: { nom: true, referenceCommerciale: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!commande) {
    throw new AccesRefuseError();
  }
  const { centre, fournisseur } = commande;
  return {
    numero: commande.numero,
    dateCommande: aujourdhui(),
    client: { raisonSociale: commande.organisation.raisonSociale, siret: centre.siret },
    livraison: {
      nom: centre.nom,
      adresse: [
        centre.adresseLigne1,
        ...(centre.adresseLigne2 === null ? [] : [centre.adresseLigne2]),
        `${centre.codePostal} ${centre.ville}`,
      ],
      telephone: centre.telephone,
      email: centre.email,
    },
    fournisseur: {
      nom: fournisseur.nom,
      adresse: fournisseur.adresse,
      numeroClient:
        fournisseur.comptes.find((c) => c.centreId === commande.centreId)?.numeroClient ?? null,
    },
    lignes: commande.lignes.map((l) => ({
      reference: l.modele?.referenceCommerciale ?? l.accessoire?.referenceCommerciale ?? null,
      designation: l.modele
        ? `${l.modele.fabricant.nom} ${l.modele.gamme} ${l.modele.nom}`
        : (l.accessoire?.nom ?? ''),
      quantite: l.quantite,
      prixUnitaireCentimes: l.prixAchatCentimes,
      referencePatient: l.referencePatient,
      oreille: l.oreille,
    })),
  };
}

/** Écrit le message dans la transaction du métier : le travail d'envoi le prendra, avec le bon en pièce jointe. */
export async function ecrireMessageCommande(
  tx: ClientTransaction,
  commande: { id: string; numero: string; centre: { nom: string } },
  destinataire: string,
  gabarit: 'BON_COMMANDE' | 'RELANCE_COMMANDE',
  cleIdempotence: string,
): Promise<void> {
  const parametres: ParametresCommandeMessage = {
    numero: commande.numero,
    centre: commande.centre.nom,
  };
  await tx.notification.create({
    data: {
      commandeId: commande.id,
      canal: 'EMAIL',
      destinataire,
      gabarit,
      parametres,
      cleIdempotence,
    },
  });
}

/**
 * Seul point de sortie d'une commande : l'EDI fabricant s'y branchera. Le PDF se rend hors transaction ; un échec
 * ensuite laisse au pire un fichier orphelin, jamais une commande envoyée sans bon.
 */
export async function transmettreCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<void> {
  if (!notifierDisponible()) {
    throw new ErreurSaisie({}, 'Aucun fournisseur d’envoi n’est configuré.');
  }
  const client = base(acteur);
  const fournisseur = await client.commande.findFirst({
    where: { id: commandeId, organisationId: acteur.organisationId },
    select: { fournisseur: { select: { emailCommande: true } } },
  });
  const destinataire = fournisseur?.fournisseur.emailCommande ?? null;
  if (destinataire === null) {
    throw ErreurSaisie.surChamp(
      'fournisseurId',
      'Ce fournisseur n’a pas d’adresse e-mail de commande.',
    );
  }
  const vue = await vueDuBon(client, acteur, commandeId);
  const pdf = await rendeurPdf().rendre(rendreBonCommandeHtml(vue));
  const bonPdfCle = `bons-commande/${randomUUID()}`;
  await documents().put(bonPdfCle, pdf, 'application/pdf');

  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (commande.statut !== 'APPROUVEE') {
        throw ErreurSaisie.surChamp('statut', 'Cette commande n’est pas prête à partir.');
      }
      await tx.commande.update({
        where: { id: commandeId },
        data: { statut: 'ENVOYEE', bonPdfCle, envoyeeLe: new Date(horloge.now()) },
      });
      await ecrireMessageCommande(
        tx,
        commande,
        destinataire,
        'BON_COMMANDE',
        `commande:${commandeId}`,
      );
      return commande;
    },
    (commande) => ({
      action: 'SEND',
      entiteType: 'COMMANDE',
      entiteId: commandeId,
      centreId: commande.centreId,
      details: { gabarit: 'BON_COMMANDE' },
    }),
  );
}

/** Bon envoyé, ou aperçu de ce qui partira. Il porte les prix : réservé aux rôles qui les voient. */
export async function telechargerBon(
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<{ contenu: Uint8Array; nomFichier: string }> {
  if (!peutVoirPrixAchat(acteur.role)) {
    throw new AccesRefuseError();
  }
  const client = base(acteur);
  const commande = await client.commande.findFirst({
    where: { id: commandeId, organisationId: acteur.organisationId },
    select: { centreId: true, bonPdfCle: true },
  });
  if (!commande) {
    throw new ErreurDocumentIntrouvable();
  }
  verifierAccesCentre(acteur, commande.centreId);
  const contenu =
    commande.bonPdfCle === null
      ? await rendeurPdf().rendre(rendreBonCommandeHtml(await vueDuBon(client, acteur, commandeId)))
      : await documents().get(commande.bonPdfCle);
  return { contenu, nomFichier: NOM_BON };
}

const STATUTS_ACCUSABLES = ['ENVOYEE', 'PARTIELLEMENT_RECUE', 'RECUE', 'FACTUREE'] as const;

function accusable(statut: string): boolean {
  return STATUTS_ACCUSABLES.some((s) => s === statut);
}

/** Accusé noté par le centre, reçu par téléphone ou par une réponse à l'e-mail. */
export async function saisirAccuse(
  acteur: UtilisateurConnecte,
  commandeId: string,
  saisie: unknown,
): Promise<void> {
  const { referenceFournisseur } = valider(accuseSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (!accusable(commande.statut)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande n’est pas partie.');
      }
      await tx.commande.update({
        where: { id: commandeId },
        data: {
          accuseLe: new Date(horloge.now()),
          accuseOrigine: 'SAISIE',
          referenceFournisseur,
        },
      });
      return commande;
    },
    (commande) => ({
      action: 'UPDATE',
      entiteType: 'COMMANDE',
      entiteId: commandeId,
      centreId: commande.centreId,
      details: { accuse: 'SAISIE' },
    }),
  );
}

export interface CommandeAccusable {
  numero: string;
  centre: string;
  dejaAccusee: boolean;
}

function cibleDuJeton(jeton: string) {
  return signatureLienCommande().lire(jeton);
}

/** Ce que voit le fournisseur : ni prix, ni référence patient, ni lignes. */
export async function lireCommandeAccusable(jeton: string): Promise<CommandeAccusable | null> {
  const cible = cibleDuJeton(jeton);
  if (cible === null) {
    return null;
  }
  const commande = await base(cible).commande.findUnique({
    where: { id: cible.commandeId },
    select: { numero: true, statut: true, accuseLe: true, centre: { select: { nom: true } } },
  });
  if (!commande || !accusable(commande.statut)) {
    return null;
  }
  return {
    numero: commande.numero,
    centre: commande.centre.nom,
    dejaAccusee: commande.accuseLe !== null,
  };
}

/** Rejouer le lien ne change rien : le premier accusé fait foi. */
export async function accuserParLien(jeton: string, saisie: unknown): Promise<boolean> {
  const cible = cibleDuJeton(jeton);
  if (cible === null) {
    return false;
  }
  const { referenceFournisseur } = valider(accuseSaisieSchema, saisie);
  return enTransaction(cible, async (tx) => {
    const { count } = await tx.commande.updateMany({
      where: {
        id: cible.commandeId,
        accuseLe: null,
        statut: { in: [...STATUTS_ACCUSABLES] },
      },
      data: {
        accuseLe: new Date(horloge.now()),
        accuseOrigine: 'LIEN',
        referenceFournisseur,
      },
    });
    if (count === 1) {
      await journaliser(tx, auteurLien(cible.organisationId), {
        action: 'UPDATE',
        entiteType: 'COMMANDE',
        entiteId: cible.commandeId,
        details: { accuse: 'LIEN' },
      });
    }
    return count === 1;
  });
}
