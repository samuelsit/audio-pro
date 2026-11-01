import { SystemClock } from '@ha/adapters';
import {
  calculerPagination,
  correctionSerieSchema,
  envoiRetourSchema,
  issueRetourSchema,
  MESSAGES_REFUS_TRANSITION,
  motifObligatoireSchema,
  pageSchema,
  periodeEnCours,
  peutDiagnostiquerSav,
  peutGererAchats,
  peutSuivreSav,
  preparationRetourSchema,
  remplacantSaisieSchema,
  rendreBonRetourHtml,
  STATUTS_RETOUR_EN_COURS,
  verifierTransition,
  type BonRetourVue,
  type Clock,
  type Pagination,
  type Perimetre,
  type StatutRetour,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { rendeurPdf } from '../pdf';
import { centresDuPerimetre } from '../perimetre';
import { versDate } from './dossiers';
import { reprendreGarantie } from './garanties';
import { aujourdhui } from './patients';
import { receptionnerDansTransaction } from './reception';
import { etatAppareil, lireAppareil, type AppareilLu } from './stock';
import {
  changerStatutTicket,
  deplacerAppareilDuTicket,
  evenementTicket,
  LIGNES_PAR_PAGE_SAV,
  lireTicket,
  prochainNumeroSav,
} from './tickets-sav';

const NOM_BON = 'bon-de-retour.pdf';
const horloge: Clock = new SystemClock();

function depuisDate(date: Date | null): string | null {
  return date && date.toISOString().slice(0, 10);
}

const selectionRetour = {
  id: true,
  numero: true,
  centreId: true,
  statut: true,
  ticketSavId: true,
  appareilId: true,
  ecartAchatId: true,
  bonPdfCle: true,
} as const;

async function lireRetour(
  tx: Pick<ClientTransaction, 'retourFabricant'>,
  acteur: UtilisateurConnecte,
  retourId: string,
) {
  const retour = await tx.retourFabricant.findFirst({
    where: { id: retourId, organisationId: acteur.organisationId },
    select: selectionRetour,
  });
  if (!retour) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, retour.centreId);
  return retour;
}

type RetourLu = Awaited<ReturnType<typeof lireRetour>>;

function evenementRetour(
  retour: Pick<RetourLu, 'id' | 'centreId'>,
  action: EvenementAudit['action'],
  details: EvenementAudit['details'] = {},
): EvenementAudit {
  return {
    action,
    entiteType: 'RETOUR_FABRICANT',
    entiteId: retour.id,
    centreId: retour.centreId,
    details,
  };
}

/** Ticket et stock sont des gestes du centre ; un écart de réception relève de la gestion des achats. */
function exigerDroit(acteur: UtilisateurConnecte, surTicket: boolean): void {
  const autorise = surTicket ? peutDiagnostiquerSav(acteur.role) : peutGererAchats(acteur.role);
  if (!autorise) {
    throw new AccesRefuseError();
  }
}

async function passerRetour(
  tx: ClientTransaction,
  retour: RetourLu,
  de: StatutRetour,
  vers: StatutRetour,
  donnees: Parameters<ClientTransaction['retourFabricant']['updateMany']>[0]['data'] = {},
): Promise<void> {
  const { count } = await tx.retourFabricant.updateMany({
    where: { id: retour.id, statut: de },
    data: { ...donnees, statut: vers },
  });
  if (count !== 1) {
    throw new ErreurSaisie({}, 'Ce retour a changé d’étape : rechargez la fiche.');
  }
}

// --- Bon de retour ------------------------------------------------------------------------------

async function vueDuBonRetour(
  client: ReturnType<typeof base>,
  acteur: UtilisateurConnecte,
  retourId: string,
): Promise<BonRetourVue> {
  const retour = await client.retourFabricant.findFirstOrThrow({
    where: { id: retourId, organisationId: acteur.organisationId },
    select: {
      numero: true,
      dateBon: true,
      descriptionPanne: true,
      ticketSavId: true,
      appareilId: true,
      ecartAchatId: true,
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
      fournisseur: { select: { nom: true, adresse: true } },
    },
  });
  const { centre, fournisseur, organisation } = retour;
  const commun = {
    numero: retour.numero,
    dateBon: depuisDate(retour.dateBon) ?? '',
    expediteur: {
      raisonSociale: organisation.raisonSociale,
      siret: centre.siret,
      nom: centre.nom,
      adresse: [
        centre.adresseLigne1,
        ...(centre.adresseLigne2 === null ? [] : [centre.adresseLigne2]),
        `${centre.codePostal} ${centre.ville}`,
      ],
      telephone: centre.telephone,
      email: centre.email,
    },
    fournisseur,
    description: retour.descriptionPanne,
  };
  if (retour.appareilId === null) {
    const ecart = await client.ecartAchat.findUniqueOrThrow({
      where: { id: retour.ecartAchatId ?? '' },
      select: {
        numeroSerie: true,
        quantiteConstatee: true,
        commande: { select: { numero: true } },
        commandeLigne: {
          select: {
            modele: { select: { gamme: true, nom: true } },
            accessoire: { select: { nom: true } },
          },
        },
      },
    });
    const { commandeLigne } = ecart;
    const modele = commandeLigne?.modele;
    return {
      ...commun,
      reference: ecart.commande?.numero ?? null,
      designation: modele
        ? `${modele.gamme} ${modele.nom}`
        : (commandeLigne?.accessoire?.nom ?? 'Produit non conforme'),
      numeroSerie: ecart.numeroSerie,
      quantite: ecart.quantiteConstatee ?? 1,
      dateDelivrance: null,
      sousGarantie: null,
      motif: null,
    };
  }
  const [appareil, garantie, ticket] = await Promise.all([
    client.appareil.findUniqueOrThrow({
      where: { id: retour.appareilId },
      select: {
        numeroSerie: true,
        modele: { select: { gamme: true, nom: true } },
        fabricant: { select: { nom: true } },
      },
    }),
    client.garantieAppareil.findUnique({
      where: { appareilId: retour.appareilId },
      select: { dateDebut: true, dateFin: true },
    }),
    retour.ticketSavId === null
      ? null
      : client.ticketSav.findUnique({
          where: { id: retour.ticketSavId },
          select: { numero: true, motif: true },
        }),
  ]);
  const jour = aujourdhui();
  return {
    ...commun,
    reference: ticket?.numero ?? null,
    designation: `${appareil.fabricant.nom} ${appareil.modele.gamme} ${appareil.modele.nom}`,
    numeroSerie: appareil.numeroSerie,
    quantite: 1,
    dateDelivrance: garantie && depuisDate(garantie.dateDebut),
    sousGarantie: garantie && periodeEnCours(depuisDate(garantie.dateFin), jour),
    motif: ticket?.motif ?? null,
  };
}

/** Rendu hors transaction : un échec laisse au pire un fichier orphelin, le téléchargement refait le bon. */
async function deposerBon(acteur: UtilisateurConnecte, retourId: string): Promise<void> {
  const client = base(acteur);
  const pdf = await rendeurPdf().rendre(
    rendreBonRetourHtml(await vueDuBonRetour(client, acteur, retourId)),
  );
  const cle = `bons-retour/${crypto.randomUUID()}`;
  await documents().put(cle, pdf, 'application/pdf');
  await client.retourFabricant.update({ where: { id: retourId }, data: { bonPdfCle: cle } });
}

export async function telechargerBonRetour(
  acteur: UtilisateurConnecte,
  retourId: string,
): Promise<{ contenu: Uint8Array; nomFichier: string }> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const client = base(acteur);
  const retour = await lireRetour(client, acteur, retourId);
  const contenu =
    retour.bonPdfCle === null
      ? await rendeurPdf().rendre(
          rendreBonRetourHtml(await vueDuBonRetour(client, acteur, retourId)),
        )
      : await documents().get(retour.bonPdfCle);
  return { contenu, nomFichier: NOM_BON };
}

// --- Préparation et envoi -----------------------------------------------------------------------

interface SourceRetour {
  readonly centreId: string;
  readonly ticketSavId: string | null;
  readonly appareilId: string | null;
  readonly ecartAchatId: string | null;
}

async function sourceDuTicket(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  ticketId: string,
): Promise<SourceRetour> {
  const ticket = await lireTicket(tx, acteur, ticketId);
  if (
    ticket.statut !== 'EN_COURS' ||
    (ticket.action !== 'ENVOI_FABRICANT' && ticket.action !== 'ECHANGE')
  ) {
    throw new ErreurSaisie(
      {},
      'Choisir d’abord un envoi au fabricant ou un échange au diagnostic.',
    );
  }
  const enCours = await tx.retourFabricant.count({
    where: { ticketSavId: ticketId, statut: { in: [...STATUTS_RETOUR_EN_COURS] } },
  });
  if (enCours > 0) {
    throw new ErreurSaisie({}, 'Ce ticket a déjà un retour en cours.');
  }
  return {
    centreId: ticket.centreId,
    ticketSavId: ticket.id,
    appareilId: ticket.appareilId,
    ecartAchatId: null,
  };
}

async function sourceDuStock(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  appareilId: string,
): Promise<SourceRetour> {
  const appareil = await lireAppareil(tx, acteur, appareilId);
  if (appareil.statut !== 'EN_STOCK') {
    throw new ErreurSaisie({}, 'Seul un appareil en stock se retourne sans ticket.');
  }
  return { centreId: appareil.centreId, ticketSavId: null, appareilId, ecartAchatId: null };
}

async function sourceDeLEcart(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  ecartId: string,
): Promise<SourceRetour> {
  const ecart = await tx.ecartAchat.findFirst({
    where: { id: ecartId, organisationId: acteur.organisationId },
    select: { centreId: true, type: true, statut: true },
  });
  if (!ecart) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, ecart.centreId);
  if (ecart.type !== 'PRODUIT_NON_CONFORME' || ecart.statut !== 'OUVERT') {
    throw new ErreurSaisie({}, 'Cet écart ne donne pas lieu à un retour.');
  }
  return { centreId: ecart.centreId, ticketSavId: null, appareilId: null, ecartAchatId: ecartId };
}

export async function preparerRetour(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  const donnees = valider(preparationRetourSchema, saisie);
  exigerDroit(acteur, donnees.ticketId !== null);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      const source =
        donnees.ticketId !== null
          ? await sourceDuTicket(tx, acteur, donnees.ticketId)
          : donnees.appareilId !== null
            ? await sourceDuStock(tx, acteur, donnees.appareilId)
            : await sourceDeLEcart(tx, acteur, donnees.ecartId ?? '');
      const fournisseur = await tx.fournisseur.findFirst({
        where: { id: donnees.fournisseurId, organisationId: acteur.organisationId },
        select: { id: true },
      });
      if (!fournisseur) {
        throw ErreurSaisie.surChamp('fournisseurId', 'Fournisseur inconnu.');
      }
      return tx.retourFabricant.create({
        data: {
          organisationId: acteur.organisationId,
          numero: await prochainNumeroSav(tx, acteur.organisationId, 'RET'),
          ...source,
          fournisseurId: fournisseur.id,
          descriptionPanne: donnees.descriptionPanne,
          dateBon: versDate(aujourdhui()),
          createdById: acteur.id,
        },
        select: { id: true, centreId: true },
      });
    },
    (retour) => evenementRetour(retour, 'CREATE'),
  );
  await deposerBon(acteur, id).catch(() => undefined);
  return id;
}

/**
 * L'appareil part : `SAV → RETOUR_FABRICANT` sous ticket, `EN_STOCK → RETOUR_FABRICANT` depuis le stock. Un écart
 * passe à résolu : le produit n'est jamais entré en stock, son remplacement arrive par la commande.
 */
export async function envoyerRetour(
  acteur: UtilisateurConnecte,
  retourId: string,
  saisie: unknown,
): Promise<void> {
  const { transporteur, numeroSuivi, dateEnvoi } = valider(envoiRetourSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const retour = await lireRetour(tx, acteur, retourId);
      exigerDroit(acteur, retour.ticketSavId !== null);
      if (dateEnvoi > aujourdhui()) {
        throw ErreurSaisie.surChamp('dateEnvoi', 'La date d’envoi ne peut pas être future.');
      }
      await passerRetour(tx, retour, 'PREPARE', 'ENVOYE', {
        transporteur,
        numeroSuivi,
        dateEnvoi: versDate(dateEnvoi),
      });
      const evenements = [evenementRetour(retour, 'UPDATE', { statut: 'ENVOYE' })];
      if (retour.ticketSavId !== null) {
        const ticket = await lireTicket(tx, acteur, retour.ticketSavId);
        await changerStatutTicket(tx, ticket, 'CHEZ_FABRICANT');
        evenements.push(evenementTicket(ticket, 'UPDATE', { statut: 'CHEZ_FABRICANT' }));
      }
      if (retour.appareilId !== null) {
        const appareil = await lireAppareil(tx, acteur, retour.appareilId);
        evenements.push(
          await deplacerAppareilDuTicket(tx, acteur, appareil, retour.ticketSavId, {
            statut: 'RETOUR_FABRICANT',
            motif: `Retour ${retour.numero}`,
          }),
        );
      }
      if (retour.ecartAchatId !== null) {
        const { count } = await tx.ecartAchat.updateMany({
          where: { id: retour.ecartAchatId, statut: 'OUVERT' },
          data: {
            statut: 'RESOLU',
            commentaire: `Retour ${retour.numero}`,
            traiteParId: acteur.id,
            traiteLe: new Date(horloge.now()),
          },
        });
        if (count !== 1) {
          throw new ErreurSaisie({}, 'Cet écart est déjà traité.');
        }
      }
      return evenements;
    },
    (evenements) => evenements,
  );
}

/** Un retour pas encore parti s'annule, sans effet sur l'appareil. */
export async function annulerRetour(acteur: UtilisateurConnecte, retourId: string): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const retour = await lireRetour(tx, acteur, retourId);
      exigerDroit(acteur, retour.ticketSavId !== null);
      await passerRetour(tx, retour, 'PREPARE', 'ANNULE');
      return retour;
    },
    (retour) => evenementRetour(retour, 'UPDATE', { statut: 'ANNULE' }),
  );
}

/**
 * Le fabricant répare ou refuse : l'appareil revient. Sous ticket, il attend son patient ou un nouveau diagnostic ;
 * sinon il reprend sa place en stock. Un produit non conforme n'a pas de retour à pointer.
 */
export async function enregistrerIssue(
  acteur: UtilisateurConnecte,
  retourId: string,
  saisie: unknown,
): Promise<void> {
  const { issue } = valider(issueRetourSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const retour = await lireRetour(tx, acteur, retourId);
      exigerDroit(acteur, retour.ticketSavId !== null);
      if (retour.appareilId === null) {
        throw new ErreurSaisie({}, 'Le remplacement arrive par la commande.');
      }
      const jour = versDate(aujourdhui());
      await passerRetour(tx, retour, 'ENVOYE', issue, { dateRetour: jour });
      const appareil = await lireAppareil(tx, acteur, retour.appareilId);
      const evenements = [evenementRetour(retour, 'UPDATE', { statut: issue })];
      evenements.push(
        await deplacerAppareilDuTicket(tx, acteur, appareil, retour.ticketSavId, {
          statut: retour.ticketSavId === null ? 'EN_STOCK' : 'SAV',
          motif: `Retour ${retour.numero} : ${issue === 'REPARE' ? 'réparé' : 'refusé'}`,
        }),
      );
      if (retour.ticketSavId !== null) {
        const ticket = await lireTicket(tx, acteur, retour.ticketSavId);
        const vers = issue === 'REPARE' ? 'A_RESTITUER' : 'EN_COURS';
        await changerStatutTicket(
          tx,
          ticket,
          vers,
          issue === 'REPARE' ? { dateReparation: jour } : {},
        );
        evenements.push(evenementTicket(ticket, 'UPDATE', { statut: vers }));
      }
      return evenements;
    },
    (evenements) => evenements,
  );
}

// --- Échange ------------------------------------------------------------------------------------

/**
 * Vérifie que l'ancien appareil pourra être remplacé, entre le remplaçant comme une livraison hors commande, et
 * renvoie sa ligne. Un numéro déjà connu chez ce fabricant est refusé : c'est une réparation, pas un échange.
 */
async function recevoirRemplacant(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  ancien: AppareilLu,
  saisie: { modeleId: string; numeroSerie: string; referenceBonLivraison: string },
): Promise<{ nouveau: AppareilLu; evenements: EvenementAudit[] }> {
  const transition = verifierTransition(etatAppareil(ancien), 'REMPLACE', false);
  if (!transition.autorisee) {
    throw new ErreurSaisie({}, MESSAGES_REFUS_TRANSITION[transition.code]);
  }
  const { appareilsParEntree, evenements } = await receptionnerDansTransaction(tx, acteur, {
    centreId: ancien.centreId,
    dateReception: aujourdhui(),
    referenceBonLivraison: saisie.referenceBonLivraison,
    referenceFactureFabricant: null,
    commandeId: null,
    appareils: [
      {
        modeleId: saisie.modeleId,
        numerosSerie: [saisie.numeroSerie],
        prixAchatCentimes: ancien.prixAchatCentimes,
        enConsignation: false,
      },
    ],
    accessoires: [],
  });
  const nouveau = await lireAppareil(tx, acteur, appareilsParEntree[0]?.[0]?.id ?? '');
  return { nouveau, evenements: [...evenements] };
}

/**
 * Le fabricant livre un remplaçant, ou l'appareil perdu est remplacé sans retour physique. Il reste réservé au
 * patient jusqu'à sa venue : ni l'ancien appareil ni la garantie ne bougent avant la remise (ADR-032).
 */
export async function enregistrerRemplacant(
  acteur: UtilisateurConnecte,
  ticketId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutDiagnostiquerSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(remplacantSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      const sansRetour =
        ticket.statut === 'EN_COURS' &&
        ticket.action === 'ECHANGE' &&
        (ticket.motif === 'PERTE' || ticket.motif === 'VOL');
      if (ticket.statut !== 'CHEZ_FABRICANT' && !sansRetour) {
        throw new ErreurSaisie({}, 'Le remplaçant s’enregistre au retour du fabricant.');
      }
      const ancien = await lireAppareil(tx, acteur, ticket.appareilId);
      const { nouveau, evenements } = await recevoirRemplacant(tx, acteur, ancien, donnees);
      if (ancien.patientId !== null) {
        evenements.push(
          await deplacerAppareilDuTicket(tx, acteur, nouveau, ticket.id, {
            statut: 'RESERVE',
            patientId: ancien.patientId,
            motif: `Remplaçant du ticket ${ticket.numero}`,
          }),
        );
      }
      const jour = versDate(aujourdhui());
      await changerStatutTicket(tx, ticket, 'A_RESTITUER', {
        appareilRemplacantId: nouveau.id,
        action: 'ECHANGE',
        dateReparation: jour,
      });
      evenements.push(evenementTicket(ticket, 'UPDATE', { statut: 'A_RESTITUER' }));
      await tx.retourFabricant.updateMany({
        where: { ticketSavId: ticket.id, statut: 'ENVOYE' },
        data: { statut: 'ECHANGE', dateRetour: jour },
      });
      return evenements;
    },
    (evenements) => evenements,
  );
}

/** Une faute de frappe se corrige tant que le remplaçant n'a pas été remis. */
export async function corrigerSerieRemplacant(
  acteur: UtilisateurConnecte,
  ticketId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutDiagnostiquerSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { numeroSerie } = valider(correctionSerieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      if (ticket.statut !== 'A_RESTITUER' || ticket.appareilRemplacantId === null) {
        throw new ErreurSaisie({}, 'Ce ticket n’attend pas de remplaçant.');
      }
      try {
        await tx.appareil.update({
          where: { id: ticket.appareilRemplacantId },
          data: { numeroSerie },
        });
      } catch (erreur) {
        traduireDoublon(
          erreur,
          {
            appareil_fabricant_id_numero_serie_key: [
              'numeroSerie',
              'Ce numéro de série existe déjà chez ce fabricant.',
            ],
          },
          'Ce numéro de série existe déjà.',
        );
      }
      return ticket;
    },
    (ticket) => evenementTicket(ticket, 'UPDATE', { serieCorrigee: true }),
  );
}

/** Le remplaçant repart en stock. Le ticket attend alors l'ancien appareil, s'il revient. */
export async function abandonnerRemplacant(
  acteur: UtilisateurConnecte,
  ticketId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutDiagnostiquerSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { motif } = valider(motifObligatoireSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      if (ticket.appareilRemplacantId === null) {
        throw new ErreurSaisie({}, 'Ce ticket n’attend pas de remplaçant.');
      }
      const remplacant = await lireAppareil(tx, acteur, ticket.appareilRemplacantId);
      await tx.ticketSav.update({
        where: { id: ticket.id },
        data: { appareilRemplacantId: null },
      });
      const evenements = [evenementTicket(ticket, 'UPDATE', { remplacantAbandonne: true })];
      if (remplacant.statut === 'RESERVE') {
        evenements.push(
          await deplacerAppareilDuTicket(tx, acteur, remplacant, ticket.id, {
            statut: 'EN_STOCK',
            motif,
          }),
        );
      }
      return evenements;
    },
    (evenements) => evenements,
  );
}

/**
 * Remise au patient, en une transaction : le remplaçant devient son appareil, l'ancien reste dans l'historique avec
 * son lien, la garantie suit. Ni délivrance, ni facture, ni nouveau délai de 4 ans. À VÉRIFIER (R52).
 */
export async function remettreRemplacant(
  acteur: UtilisateurConnecte,
  ticketId: string,
): Promise<void> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      if (ticket.appareilRemplacantId === null) {
        throw new ErreurSaisie({}, 'Ce ticket n’attend pas de remplaçant.');
      }
      await changerStatutTicket(tx, ticket, 'CLOTURE', { dateCloture: versDate(aujourdhui()) });
      const nouveau = await lireAppareil(tx, acteur, ticket.appareilRemplacantId);
      const ancien = await lireAppareil(tx, acteur, ticket.appareilId);
      const motif = `Échange du ticket ${ticket.numero}`;
      const evenements: EvenementAudit[] = [];
      if (ancien.patientId !== null) {
        evenements.push(
          await deplacerAppareilDuTicket(tx, acteur, nouveau, ticket.id, {
            type: 'ECHANGE',
            statut: 'VENDU',
            motif,
          }),
        );
        await reprendreGarantie(tx, {
          ancienId: ancien.id,
          nouveauId: nouveau.id,
          patientId: ancien.patientId,
        });
      }
      evenements.push(
        await deplacerAppareilDuTicket(tx, acteur, ancien, ticket.id, {
          type: 'ECHANGE',
          statut: 'REMPLACE',
          remplaceParId: nouveau.id,
          motif,
        }),
      );
      return [...evenements, evenementTicket(ticket, 'UPDATE', { statut: 'CLOTURE' })];
    },
    (evenements) => evenements,
  );
}

/** Échange d'un appareil du stock, sans ticket ni patient : tout se fait à la réception du remplaçant. */
export async function echangerAppareilDuStock(
  acteur: UtilisateurConnecte,
  retourId: string,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(remplacantSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const retour = await lireRetour(tx, acteur, retourId);
      exigerDroit(acteur, false);
      if (retour.ticketSavId !== null || retour.appareilId === null) {
        throw new ErreurSaisie({}, 'Ce retour ne porte pas sur un appareil du stock.');
      }
      await passerRetour(tx, retour, 'ENVOYE', 'ECHANGE', { dateRetour: versDate(aujourdhui()) });
      const ancien = await lireAppareil(tx, acteur, retour.appareilId);
      const { nouveau, evenements } = await recevoirRemplacant(tx, acteur, ancien, donnees);
      evenements.push(
        await deplacerAppareilDuTicket(tx, acteur, ancien, null, {
          type: 'ECHANGE',
          statut: 'REMPLACE',
          remplaceParId: nouveau.id,
          motif: `Échange du retour ${retour.numero}`,
        }),
      );
      return [...evenements, evenementRetour(retour, 'UPDATE', { statut: 'ECHANGE' })];
    },
    (evenements) => evenements,
  );
}

// --- Lecture ------------------------------------------------------------------------------------

export interface RetourListe {
  id: string;
  numero: string;
  statut: StatutRetour;
  fournisseur: string;
  centre: string;
  numeroSerie: string | null;
  ticketId: string | null;
  dateBon: string;
  dateEnvoi: string | null;
  dateRetour: string | null;
}

export async function listerRetours(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  parametres: { page?: string | undefined },
): Promise<{ lignes: RetourListe[]; pagination: Pagination }> {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const where = {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
  };
  const client = base(acteur);
  const total = await client.retourFabricant.count({ where });
  const pagination = calculerPagination(
    total,
    pageSchema.parse(parametres.page),
    LIGNES_PAR_PAGE_SAV,
  );
  const lignes = await client.retourFabricant.findMany({
    where,
    orderBy: { id: 'desc' },
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_SAV,
    select: {
      id: true,
      numero: true,
      statut: true,
      dateBon: true,
      dateEnvoi: true,
      dateRetour: true,
      ticketSavId: true,
      centre: { select: { nom: true } },
      fournisseur: { select: { nom: true } },
      appareil: { select: { numeroSerie: true } },
    },
  });
  return {
    lignes: lignes.map((r) => ({
      id: r.id,
      numero: r.numero,
      statut: r.statut,
      fournisseur: r.fournisseur.nom,
      centre: r.centre.nom,
      numeroSerie: r.appareil?.numeroSerie ?? null,
      ticketId: r.ticketSavId,
      dateBon: depuisDate(r.dateBon) ?? '',
      dateEnvoi: depuisDate(r.dateEnvoi),
      dateRetour: depuisDate(r.dateRetour),
    })),
    pagination,
  };
}

export interface FicheRetour extends RetourListe {
  descriptionPanne: string | null;
  transporteur: string | null;
  numeroSuivi: string | null;
  sourceStock: boolean;
  modeleId: string | null;
}

export async function obtenirRetour(
  acteur: UtilisateurConnecte,
  retourId: string,
): Promise<FicheRetour> {
  const client = base(acteur);
  await lireRetour(client, acteur, retourId);
  const r = await client.retourFabricant.findUniqueOrThrow({
    where: { id: retourId },
    select: {
      id: true,
      numero: true,
      statut: true,
      dateBon: true,
      dateEnvoi: true,
      dateRetour: true,
      ticketSavId: true,
      appareilId: true,
      descriptionPanne: true,
      transporteur: true,
      numeroSuivi: true,
      centre: { select: { nom: true } },
      fournisseur: { select: { nom: true } },
      appareil: { select: { numeroSerie: true, modeleId: true } },
    },
  });
  return {
    id: r.id,
    numero: r.numero,
    statut: r.statut,
    fournisseur: r.fournisseur.nom,
    centre: r.centre.nom,
    numeroSerie: r.appareil?.numeroSerie ?? null,
    modeleId: r.appareil?.modeleId ?? null,
    ticketId: r.ticketSavId,
    sourceStock: r.ticketSavId === null && r.appareilId !== null,
    dateBon: depuisDate(r.dateBon) ?? '',
    dateEnvoi: depuisDate(r.dateEnvoi),
    dateRetour: depuisDate(r.dateRetour),
    descriptionPanne: r.descriptionPanne,
    transporteur: r.transporteur,
    numeroSuivi: r.numeroSuivi,
  };
}

export async function retourDuTicket(
  acteur: UtilisateurConnecte,
  ticketId: string,
): Promise<{ id: string; numero: string; statut: StatutRetour } | null> {
  return base(acteur).retourFabricant.findFirst({
    where: { ticketSavId: ticketId, organisationId: acteur.organisationId },
    select: { id: true, numero: true, statut: true },
    orderBy: { id: 'desc' },
  });
}

/** Fournisseur proposé : celui du fabricant de l'appareil. */
export async function fournisseursDuRetour(
  acteur: UtilisateurConnecte,
  fabricantId: string | null,
): Promise<{ options: { id: string; nom: string }[]; defaut: string }> {
  const options = await base(acteur).fournisseur.findMany({
    where: { organisationId: acteur.organisationId, actif: true },
    select: { id: true, nom: true, fabricantId: true },
    orderBy: { nom: 'asc' },
  });
  const defaut = options.find((o) => o.fabricantId !== null && o.fabricantId === fabricantId);
  return { options, defaut: defaut?.id ?? '' };
}
