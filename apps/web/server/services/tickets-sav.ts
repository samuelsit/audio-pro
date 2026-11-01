import {
  calculerPagination,
  centimes,
  couvertureTicket,
  diagnosticTicketSchema,
  filtreTicketsSchema,
  MESSAGES_REFUS_FACTURATION,
  MESSAGES_REFUS_TRANSITION,
  motifObligatoireSchema,
  ouvertureTicketSchema,
  peutDiagnostiquerSav,
  peutSuivreSav,
  peutValiderFacture,
  refusFacturationTicket,
  STATUTS_TICKET_OUVERTS,
  ticketPeutPasser,
  verifierTransition,
  type ActionSav,
  type CouvertureSav,
  type FiltreTickets,
  type MotifSav,
  type Pagination,
  type Perimetre,
  type StatutAppareil,
  type StatutTicket,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { versDate } from './dossiers';
import { ecrireLigneBrouillon, ouvrirVenteDirecte } from './facturation';
import { garantieDeLAppareil, type GarantieAffichee } from './garanties';
import { aujourdhui } from './patients';
import {
  afficherPatient,
  appliquerMouvement,
  etatAppareil,
  evenementMouvement,
  lireAppareil,
  selectionPatientSuivi,
  type AppareilLu,
  type Mouvement,
  type PatientAffiche,
} from './stock';

export const LIGNES_PAR_PAGE_SAV = 50;

function depuisDate(date: Date | null): string | null {
  return date && date.toISOString().slice(0, 10);
}

/** Le ticket a changé depuis que l'utilisateur l'a vu. */
export class ErreurConflitTicket extends ErreurSaisie {
  constructor() {
    super({}, 'Ce ticket vient d’être modifié par ailleurs : rechargez la fiche et recommencez.');
    this.name = 'ErreurConflitTicket';
  }
}

/** Une série par client et par an, comme les commandes : un rollback rend le numéro. */
export async function prochainNumeroSav(
  tx: ClientTransaction,
  organisationId: string,
  prefixe: 'SAV' | 'RET',
): Promise<string> {
  const annee = Number(aujourdhui().slice(0, 4));
  const { dernier } = await tx.compteurSav.upsert({
    where: { organisationId_nature_annee: { organisationId, nature: prefixe, annee } },
    create: { organisationId, nature: prefixe, annee, dernier: 1 },
    update: { dernier: { increment: 1 } },
    select: { dernier: true },
  });
  return `${prefixe}-${String(annee)}-${String(dernier).padStart(6, '0')}`;
}

const selectionTicket = {
  id: true,
  organisationId: true,
  numero: true,
  centreId: true,
  patientId: true,
  appareilId: true,
  appareilRemplacantId: true,
  motif: true,
  description: true,
  diagnostic: true,
  action: true,
  statut: true,
  couverture: true,
  coutCentimes: true,
  factureId: true,
  motifFacturation: true,
  motifAnnulation: true,
  dateOuverture: true,
  dateDiagnostic: true,
  dateReparation: true,
  dateCloture: true,
} as const;

export async function lireTicket(
  tx: Pick<ClientTransaction, 'ticketSav'>,
  acteur: UtilisateurConnecte,
  ticketId: string,
) {
  const ticket = await tx.ticketSav.findFirst({
    where: { id: ticketId, organisationId: acteur.organisationId },
    select: selectionTicket,
  });
  if (!ticket) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, ticket.centreId);
  return ticket;
}

export type TicketLu = Awaited<ReturnType<typeof lireTicket>>;

export function evenementTicket(
  ticket: Pick<TicketLu, 'id' | 'patientId' | 'centreId'>,
  action: EvenementAudit['action'],
  details: EvenementAudit['details'] = {},
): EvenementAudit {
  return {
    action,
    entiteType: 'TICKET_SAV',
    entiteId: ticket.id,
    patientId: ticket.patientId,
    centreId: ticket.centreId,
    details,
  };
}

/** Passe le ticket à `vers` s'il n'a pas bougé depuis sa lecture. Les dates et champs suivent. */
export async function changerStatutTicket(
  tx: ClientTransaction,
  ticket: TicketLu,
  vers: StatutTicket,
  donnees: Parameters<ClientTransaction['ticketSav']['updateMany']>[0]['data'] = {},
): Promise<void> {
  if (!ticketPeutPasser(ticket.statut, vers)) {
    throw new ErreurSaisie({}, 'Cette étape n’est pas possible pour ce ticket.');
  }
  const { count } = await tx.ticketSav.updateMany({
    where: { id: ticket.id, statut: ticket.statut },
    data: { ...donnees, statut: vers },
  });
  if (count !== 1) {
    throw new ErreurConflitTicket();
  }
}

/** Écrit un mouvement d'appareil lié au ticket, après contrôle de la transition. */
export async function deplacerAppareilDuTicket(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  appareil: AppareilLu,
  ticketId: string,
  mouvement: Pick<Mouvement, 'statut' | 'motif'> & Partial<Mouvement>,
): Promise<EvenementAudit> {
  const transition = verifierTransition(etatAppareil(appareil), mouvement.statut, true);
  if (!transition.autorisee) {
    throw new ErreurSaisie({}, MESSAGES_REFUS_TRANSITION[transition.code]);
  }
  const complet: Mouvement = {
    type: 'CHANGEMENT_STATUT',
    centreId: appareil.centreId,
    patientId: transition.effetPatient === 'DETACHER' ? null : appareil.patientId,
    ticketSavId: ticketId,
    ...mouvement,
  };
  await appliquerMouvement(tx, acteur, appareil, complet);
  return evenementMouvement(appareil, complet, appareil.centreId);
}

// --- Ouverture ----------------------------------------------------------------------------------

/**
 * Passe l'appareil en SAV et ouvre le ticket, y compris pour une perte : SAV veut dire « sous ticket », un
 * appareil `VENDU` n'a donc jamais de ticket ouvert. Un appareil déjà au SAV sans ticket est repris tel quel,
 * son mouvement verrouille la ligne contre une sortie concurrente par la fiche.
 */
export async function ouvrirTicket(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { numeroSerie, motif, description } = valider(ouvertureTicketSchema, saisie);
  const { ticket } = await withAudit(
    acteur,
    async (tx) => {
      const trouves = await tx.appareil.findMany({
        where: { organisationId: acteur.organisationId, numeroSerie },
        select: { id: true },
        take: 2,
      });
      const [seul, autre] = trouves;
      if (!seul) {
        throw ErreurSaisie.surChamp('numeroSerie', 'Numéro de série inconnu.');
      }
      if (autre) {
        throw ErreurSaisie.surChamp(
          'numeroSerie',
          'Ce numéro existe chez deux fabricants : ouvrir le ticket depuis la fiche de l’appareil.',
        );
      }
      const appareil = await lireAppareil(tx, acteur, seul.id);
      if (appareil.statut !== 'VENDU' && appareil.statut !== 'SAV') {
        throw ErreurSaisie.surChamp(
          'numeroSerie',
          'Un ticket s’ouvre sur un appareil vendu ou déjà au SAV.',
        );
      }
      const garantie = await tx.garantieAppareil.findUnique({
        where: { appareilId: appareil.id },
        select: { dateFin: true, assuranceFin: true },
      });
      const jour = aujourdhui();
      const couverture = couvertureTicket(
        motif,
        garantie && {
          dateFin: depuisDate(garantie.dateFin) ?? jour,
          assuranceFin: depuisDate(garantie.assuranceFin),
        },
        jour,
      );
      const cree = await tx.ticketSav.create({
        data: {
          organisationId: acteur.organisationId,
          numero: await prochainNumeroSav(tx, acteur.organisationId, 'SAV'),
          centreId: appareil.centreId,
          patientId: appareil.patientId,
          appareilId: appareil.id,
          motif,
          description,
          couverture,
          dateOuverture: versDate(jour),
          ouvertParId: acteur.id,
        },
        select: { id: true, patientId: true, centreId: true },
      });
      const mouvement: Mouvement = {
        type: 'CHANGEMENT_STATUT',
        statut: 'SAV',
        centreId: appareil.centreId,
        patientId: appareil.patientId,
        ticketSavId: cree.id,
        motif: 'Ouverture d’un ticket SAV',
      };
      if (appareil.statut === 'VENDU') {
        await deplacerAppareilDuTicket(tx, acteur, appareil, cree.id, mouvement);
      } else {
        await appliquerMouvement(tx, acteur, appareil, mouvement);
      }
      return {
        ticket: cree,
        evenements: [
          evenementTicket(cree, 'CREATE', { motif, couverture }),
          evenementMouvement(appareil, mouvement, appareil.centreId),
        ],
      };
    },
    (resultat) => resultat.evenements,
  );
  return ticket.id;
}

// --- Diagnostic et étapes -----------------------------------------------------------------------

/** La couverture se recalcule à la date d'ouverture : le diagnostic peut changer le motif déclaré. */
export async function diagnostiquerTicket(
  acteur: UtilisateurConnecte,
  ticketId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutDiagnostiquerSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { motif, diagnostic, action, cout } = valider(diagnosticTicketSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      if (ticket.statut !== 'OUVERT' && ticket.statut !== 'EN_COURS') {
        throw new ErreurSaisie({}, 'Le diagnostic ne se modifie plus à cette étape.');
      }
      const garantie = await tx.garantieAppareil.findUnique({
        where: { appareilId: ticket.appareilId },
        select: { dateFin: true, assuranceFin: true },
      });
      const ouverture = depuisDate(ticket.dateOuverture) ?? aujourdhui();
      const couverture = couvertureTicket(
        motif,
        garantie && {
          dateFin: depuisDate(garantie.dateFin) ?? ouverture,
          assuranceFin: depuisDate(garantie.assuranceFin),
        },
        ouverture,
      );
      const { count } = await tx.ticketSav.updateMany({
        where: { id: ticketId, statut: ticket.statut },
        data: {
          motif,
          diagnostic,
          action,
          couverture,
          coutCentimes: cout,
          statut: 'EN_COURS',
          dateDiagnostic: ticket.dateDiagnostic ?? versDate(aujourdhui()),
        },
      });
      if (count !== 1) {
        throw new ErreurConflitTicket();
      }
      return { ticket, couverture };
    },
    ({ ticket, couverture }) => evenementTicket(ticket, 'UPDATE', { motif, action, couverture }),
  );
}

/** Rien ne s'annule une fois l'appareil parti, ou un remplaçant reçu. L'appareil revient à son détenteur. */
export async function annulerTicket(
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
      if (ticket.appareilRemplacantId !== null) {
        throw new ErreurSaisie({}, 'Abandonner d’abord le remplaçant reçu.');
      }
      await changerStatutTicket(tx, ticket, 'ANNULE', {
        motifAnnulation: motif,
        dateCloture: versDate(aujourdhui()),
      });
      const appareil = await lireAppareil(tx, acteur, ticket.appareilId);
      const evenement = await deplacerAppareilDuTicket(tx, acteur, appareil, ticket.id, {
        statut: appareil.patientId === null ? 'EN_STOCK' : 'VENDU',
        motif: 'Ticket SAV annulé',
      });
      return [evenementTicket(ticket, 'UPDATE', { statut: 'ANNULE' }), evenement];
    },
    (evenements) => evenements,
  );
}

/** Réparation au centre terminée : l'appareil attend son patient. */
export async function terminerReparation(
  acteur: UtilisateurConnecte,
  ticketId: string,
): Promise<void> {
  if (!peutDiagnostiquerSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      if (ticket.action !== 'REPARATION_CENTRE') {
        throw new ErreurSaisie({}, 'Ce ticket ne prévoit pas de réparation au centre.');
      }
      await changerStatutTicket(tx, ticket, 'A_RESTITUER', {
        dateReparation: versDate(aujourdhui()),
      });
      return ticket;
    },
    (ticket) => evenementTicket(ticket, 'UPDATE', { statut: 'A_RESTITUER' }),
  );
}

/** Remise de l'appareil réparé à son détenteur, ou retour en stock s'il n'en a pas. */
export async function restituerAppareil(
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
      if (ticket.appareilRemplacantId !== null) {
        throw new ErreurSaisie({}, 'Ce ticket se clôt par la remise du remplaçant.');
      }
      await changerStatutTicket(tx, ticket, 'CLOTURE', { dateCloture: versDate(aujourdhui()) });
      const appareil = await lireAppareil(tx, acteur, ticket.appareilId);
      const evenement = await deplacerAppareilDuTicket(tx, acteur, appareil, ticket.id, {
        statut: appareil.patientId === null ? 'EN_STOCK' : 'VENDU',
        motif: 'Restitution après réparation',
      });
      return [evenementTicket(ticket, 'UPDATE', { statut: 'CLOTURE' }), evenement];
    },
    (evenements) => evenements,
  );
}

/**
 * Ouvre un brouillon de vente directe, ligne d'entretien hors LPP, lié au ticket. La facturation se termine
 * sur l'écran de la facture. Un brouillon abandonné libère le ticket.
 * Source : modele-devis-audio.pdf p. 2 § 4, voir `refusFacturationTicket`.
 */
export async function facturerTicket(
  acteur: UtilisateurConnecte,
  ticketId: string,
  saisie: unknown,
): Promise<string> {
  if (!peutValiderFacture(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { motif } = valider(motifObligatoireSchema, saisie);
  const { factureId } = await withAudit(
    acteur,
    async (tx) => {
      const ticket = await lireTicket(tx, acteur, ticketId);
      const refus = refusFacturationTicket(ticket);
      if (refus !== null) {
        throw new ErreurSaisie({}, MESSAGES_REFUS_FACTURATION[refus]);
      }
      if (ticket.statut === 'ANNULE') {
        throw new ErreurSaisie({}, 'Ce ticket est annulé.');
      }
      if (ticket.factureId !== null) {
        const { statut } = await tx.facture.findUniqueOrThrow({
          where: { id: ticket.factureId },
          select: { statut: true },
        });
        if (statut !== 'ABANDONNEE') {
          throw new ErreurSaisie({}, 'Ce ticket est déjà facturé.');
        }
      }
      const factureId = await ouvrirVenteDirecte(tx, acteur, {
        patientId: ticket.patientId ?? '',
        centreId: ticket.centreId,
        prescriptionId: null,
      });
      await ecrireLigneBrouillon(tx, acteur, factureId, {
        nature: 'ENTRETIEN',
        accessoireId: null,
        libelle: `Réparation ${ticket.numero}`,
        quantite: 1,
        prixUnitaire: centimes(ticket.coutCentimes ?? 0),
      });
      const { count } = await tx.ticketSav.updateMany({
        where: { id: ticketId, factureId: ticket.factureId },
        data: { factureId, motifFacturation: motif },
      });
      if (count !== 1) {
        throw new ErreurConflitTicket();
      }
      return { ticket, factureId };
    },
    ({ ticket, factureId }) => [
      evenementTicket(ticket, 'UPDATE', { factureId }),
      {
        action: 'CREATE',
        entiteType: 'FACTURE',
        entiteId: factureId,
        patientId: ticket.patientId,
        centreId: ticket.centreId,
      },
    ],
  );
  return factureId;
}

// --- Lecture ------------------------------------------------------------------------------------

export interface TicketListe {
  id: string;
  numero: string;
  statut: StatutTicket;
  motif: MotifSav;
  couverture: CouvertureSav;
  centre: string;
  numeroSerie: string;
  patient: PatientAffiche | null;
  patientMasque: boolean;
  dateOuverture: string;
}

export async function listerTickets(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  parametres: unknown,
): Promise<{ lignes: TicketListe[]; pagination: Pagination; filtre: FiltreTickets }> {
  verifierPerimetre(acteur, perimetre);
  const filtre = filtreTicketsSchema.parse(parametres);
  const centres = centresDuPerimetre(acteur, perimetre);
  const where = {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    ...(filtre.statut ? { statut: filtre.statut } : {}),
    ...(filtre.motif ? { motif: filtre.motif } : {}),
  };
  const client = base(acteur);
  const total = await client.ticketSav.count({ where });
  const pagination = calculerPagination(total, filtre.page, LIGNES_PAR_PAGE_SAV);
  const lignes = await client.ticketSav.findMany({
    where,
    orderBy: { id: 'desc' },
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_SAV,
    select: {
      id: true,
      numero: true,
      statut: true,
      motif: true,
      couverture: true,
      dateOuverture: true,
      centre: { select: { nom: true } },
      appareil: { select: { numeroSerie: true } },
      patient: { select: selectionPatientSuivi },
    },
  });
  return {
    lignes: lignes.map((t) => ({
      id: t.id,
      numero: t.numero,
      statut: t.statut,
      motif: t.motif,
      couverture: t.couverture,
      centre: t.centre.nom,
      numeroSerie: t.appareil.numeroSerie,
      ...afficherPatient(acteur, t.patient),
      dateOuverture: depuisDate(t.dateOuverture) ?? '',
    })),
    pagination,
    filtre,
  };
}

export interface FicheTicket {
  id: string;
  numero: string;
  statut: StatutTicket;
  motif: MotifSav;
  description: string | null;
  diagnostic: string | null;
  action: ActionSav | null;
  couverture: CouvertureSav;
  coutCentimes: number | null;
  centre: string;
  patient: PatientAffiche | null;
  patientMasque: boolean;
  appareil: {
    id: string;
    numeroSerie: string;
    designation: string;
    statut: StatutAppareil;
  };
  remplacant: { id: string; numeroSerie: string } | null;
  garantie: GarantieAffichee | null;
  facture: { id: string; numero: string | null; statut: string } | null;
  motifFacturation: string | null;
  motifAnnulation: string | null;
  dateOuverture: string;
  dateDiagnostic: string | null;
  dateReparation: string | null;
  dateCloture: string | null;
  peutDiagnostiquer: boolean;
  peutFacturer: boolean;
}

/** Une ligne READ : le ticket révèle l'appareillage et le motif de la visite. */
export async function obtenirTicket(
  acteur: UtilisateurConnecte,
  ticketId: string,
): Promise<FicheTicket> {
  const client = base(acteur);
  const ticket = await lireTicket(client, acteur, ticketId);
  await withAudit(acteur, () => Promise.resolve(), evenementTicket(ticket, 'READ'));
  const [appareil, patient, remplacant, facture, centre, garantie] = await Promise.all([
    client.appareil.findUniqueOrThrow({
      where: { id: ticket.appareilId },
      select: {
        id: true,
        numeroSerie: true,
        statut: true,
        modele: { select: { gamme: true, nom: true } },
        fabricant: { select: { nom: true } },
      },
    }),
    ticket.patientId === null
      ? null
      : client.patient.findUnique({
          where: { id: ticket.patientId },
          select: selectionPatientSuivi,
        }),
    ticket.appareilRemplacantId === null
      ? null
      : client.appareil.findUnique({
          where: { id: ticket.appareilRemplacantId },
          select: { id: true, numeroSerie: true },
        }),
    ticket.factureId === null
      ? null
      : client.facture.findUnique({
          where: { id: ticket.factureId },
          select: { id: true, numero: true, statut: true },
        }),
    client.centre.findUniqueOrThrow({
      where: { id: ticket.centreId },
      select: { nom: true },
    }),
    garantieDeLAppareil(client, ticket.appareilId),
  ]);
  return {
    id: ticket.id,
    numero: ticket.numero,
    statut: ticket.statut,
    motif: ticket.motif,
    description: ticket.description,
    diagnostic: ticket.diagnostic,
    action: ticket.action,
    couverture: ticket.couverture,
    coutCentimes: ticket.coutCentimes,
    centre: centre.nom,
    ...afficherPatient(acteur, patient),
    appareil: {
      id: appareil.id,
      numeroSerie: appareil.numeroSerie,
      designation: `${appareil.fabricant.nom} ${appareil.modele.gamme} ${appareil.modele.nom}`,
      statut: appareil.statut,
    },
    remplacant,
    garantie,
    facture: facture?.statut === 'ABANDONNEE' ? null : facture,
    motifFacturation: ticket.motifFacturation,
    motifAnnulation: ticket.motifAnnulation,
    dateOuverture: depuisDate(ticket.dateOuverture) ?? '',
    dateDiagnostic: depuisDate(ticket.dateDiagnostic),
    dateReparation: depuisDate(ticket.dateReparation),
    dateCloture: depuisDate(ticket.dateCloture),
    peutDiagnostiquer: peutDiagnostiquerSav(acteur.role),
    peutFacturer:
      peutValiderFacture(acteur.role) &&
      refusFacturationTicket(ticket) === null &&
      ticket.statut !== 'ANNULE' &&
      facture?.statut !== 'VALIDEE' &&
      facture?.statut !== 'BROUILLON',
  };
}

export async function compterTicketsOuverts(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<number> {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  return base(acteur).ticketSav.count({
    where: {
      organisationId: acteur.organisationId,
      statut: { in: [...STATUTS_TICKET_OUVERTS] },
      ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    },
  });
}
