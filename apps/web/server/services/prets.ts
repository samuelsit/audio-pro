import {
  ajouterJours,
  calculerPagination,
  etatPret,
  pageSchema,
  parcPretSaisieSchema,
  peutGererParcPret,
  peutSuivreSav,
  pretSaisieSchema,
  retourPretSaisieSchema,
  type EtatPret,
  type Pagination,
  type Perimetre,
  type StatutAppareil,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { versDate } from './dossiers';
import { parametresSav } from './garanties';
import { aujourdhui } from './patients';
import {
  afficherPatient,
  lireAppareil,
  selectionPatientSuivi,
  verifierPatient,
  type PatientAffiche,
} from './stock';
import { deplacerAppareilDuTicket, LIGNES_PAR_PAGE_SAV } from './tickets-sav';

function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function evenementPret(
  pret: { id: string; patientId: string; centreId: string },
  action: EvenementAudit['action'],
): EvenementAudit {
  return {
    action,
    entiteType: 'PRET_APPAREIL',
    entiteId: pret.id,
    patientId: pret.patientId,
    centreId: pret.centreId,
  };
}

/** Un appareil du parc ne se réserve ni ne se vend : seule une décision de gestion l'y met ou l'en retire. */
export async function affecterAuParc(
  acteur: UtilisateurConnecte,
  appareilId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutGererParcPret(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { parcPret } = valider(parcPretSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const appareil = await lireAppareil(tx, acteur, appareilId);
      const { count } = await tx.appareil.updateMany({
        where: { id: appareilId, statut: 'EN_STOCK' },
        data: { parcPret },
      });
      if (count !== 1) {
        throw new ErreurSaisie({}, 'Seul un appareil en stock change de parc.');
      }
      return appareil;
    },
    ({ centreId }) => ({
      action: 'UPDATE',
      entiteType: 'APPAREIL',
      entiteId: appareilId,
      centreId,
      details: { parcPret },
    }),
  );
}

export async function preterAppareil(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { appareilId, patientId, dateRetourPrevue, ticketId } = valider(pretSaisieSchema, saisie);
  const { pret } = await withAudit(
    acteur,
    async (tx) => {
      const appareil = await lireAppareil(tx, acteur, appareilId);
      if (!appareil.parcPret) {
        throw ErreurSaisie.surChamp('appareilId', 'Cet appareil n’est pas dans le parc de prêt.');
      }
      await verifierPatient(tx, acteur, patientId);
      const jour = aujourdhui();
      const { pretDureeJours } = await parametresSav(tx, acteur.organisationId);
      const prevue = dateRetourPrevue ?? ajouterJours(jour, pretDureeJours);
      if (prevue < jour) {
        throw ErreurSaisie.surChamp('dateRetourPrevue', 'Cette date est déjà passée.');
      }
      if (ticketId !== null) {
        await verifierTicketDuPatient(tx, acteur, ticketId, patientId);
      }
      const evenement = await deplacerAppareilDuTicket(tx, acteur, appareil, ticketId, {
        statut: 'PRET',
        patientId,
        motif: 'Prêt',
      });
      let cree;
      try {
        cree = await tx.pretAppareil.create({
          data: {
            organisationId: acteur.organisationId,
            appareilId,
            centreId: appareil.centreId,
            patientId,
            ticketSavId: ticketId,
            dateDebut: versDate(jour),
            dateRetourPrevue: versDate(prevue),
            createdById: acteur.id,
          },
          select: { id: true, patientId: true, centreId: true },
        });
      } catch (erreur) {
        traduireDoublon(
          erreur,
          { pret_appareil_en_cours: ['appareilId', 'Cet appareil est déjà prêté.'] },
          'Cet appareil est déjà prêté.',
        );
      }
      return { pret: cree, evenements: [evenementPret(cree, 'CREATE'), evenement] };
    },
    ({ evenements }) => evenements,
  );
  return pret.id;
}

async function verifierTicketDuPatient(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  ticketId: string,
  patientId: string,
): Promise<void> {
  const ticket = await tx.ticketSav.findFirst({
    where: { id: ticketId, organisationId: acteur.organisationId, patientId },
    select: { id: true },
  });
  if (!ticket) {
    throw ErreurSaisie.surChamp('ticketId', 'Ce ticket n’est pas celui du patient.');
  }
}

export async function rendrePret(
  acteur: UtilisateurConnecte,
  pretId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { etatRetour } = valider(retourPretSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const pret = await tx.pretAppareil.findFirst({
        where: { id: pretId, organisationId: acteur.organisationId },
        select: {
          id: true,
          appareilId: true,
          patientId: true,
          centreId: true,
          ticketSavId: true,
        },
      });
      if (!pret) {
        throw new AccesRefuseError();
      }
      verifierAccesCentre(acteur, pret.centreId);
      const { count } = await tx.pretAppareil.updateMany({
        where: { id: pretId, dateRetour: null },
        data: { dateRetour: versDate(aujourdhui()), etatRetour },
      });
      if (count !== 1) {
        throw new ErreurSaisie({}, 'Ce prêt est déjà rendu.');
      }
      const appareil = await lireAppareil(tx, acteur, pret.appareilId);
      const evenement = await deplacerAppareilDuTicket(tx, acteur, appareil, pret.ticketSavId, {
        statut: 'EN_STOCK',
        motif: 'Retour de prêt',
      });
      return [evenementPret(pret, 'UPDATE'), evenement];
    },
    (evenements) => evenements,
  );
}

function clauseCentres(acteur: UtilisateurConnecte, perimetre: Perimetre) {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  return {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
  };
}

export interface PretListe {
  id: string;
  appareilId: string;
  numeroSerie: string;
  centre: string;
  patient: PatientAffiche | null;
  patientMasque: boolean;
  dateDebut: string;
  dateRetourPrevue: string;
  dateRetour: string | null;
  etat: EtatPret;
}

export async function listerPrets(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  parametres: { page?: string | undefined },
): Promise<{ lignes: PretListe[]; pagination: Pagination }> {
  const where = clauseCentres(acteur, perimetre);
  const client = base(acteur);
  const total = await client.pretAppareil.count({ where });
  const pagination = calculerPagination(
    total,
    pageSchema.parse(parametres.page),
    LIGNES_PAR_PAGE_SAV,
  );
  const lignes = await client.pretAppareil.findMany({
    where,
    // Les prêts en cours d'abord, les plus anciennes échéances en tête : un retard ne se perd pas en page 2.
    orderBy: [{ dateRetour: { sort: 'desc', nulls: 'first' } }, { dateRetourPrevue: 'asc' }],
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_SAV,
    select: {
      id: true,
      appareilId: true,
      dateDebut: true,
      dateRetourPrevue: true,
      dateRetour: true,
      centre: { select: { nom: true } },
      appareil: { select: { numeroSerie: true } },
      patient: { select: selectionPatientSuivi },
    },
  });
  const jour = aujourdhui();
  return {
    lignes: lignes.map((p) => {
      const dates = {
        dateRetourPrevue: depuisDate(p.dateRetourPrevue),
        dateRetour: p.dateRetour && depuisDate(p.dateRetour),
      };
      return {
        id: p.id,
        appareilId: p.appareilId,
        numeroSerie: p.appareil.numeroSerie,
        centre: p.centre.nom,
        ...afficherPatient(acteur, p.patient),
        dateDebut: depuisDate(p.dateDebut),
        ...dates,
        etat: etatPret(dates, jour),
      };
    }),
    pagination,
  };
}

/** Alerte de la page SAV. Calculée à la lecture : le message au patient viendra à l'étape 19. */
export async function compterPretsEnRetard(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<number> {
  return base(acteur).pretAppareil.count({
    where: {
      ...clauseCentres(acteur, perimetre),
      dateRetour: null,
      dateRetourPrevue: { lt: versDate(aujourdhui()) },
    },
  });
}

export interface AppareilDuParc {
  id: string;
  numeroSerie: string;
  designation: string;
  centreId: string;
  centre: string;
  statut: StatutAppareil;
}

export async function listerParc(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<AppareilDuParc[]> {
  const lignes = await base(acteur).appareil.findMany({
    where: { ...clauseCentres(acteur, perimetre), parcPret: true },
    select: {
      id: true,
      numeroSerie: true,
      statut: true,
      centreId: true,
      centre: { select: { nom: true } },
      modele: { select: { gamme: true, nom: true } },
      fabricant: { select: { nom: true } },
    },
    orderBy: { numeroSerie: 'asc' },
  });
  return lignes.map((a) => ({
    id: a.id,
    numeroSerie: a.numeroSerie,
    designation: `${a.fabricant.nom} ${a.modele.gamme} ${a.modele.nom}`,
    centreId: a.centreId,
    centre: a.centre.nom,
    statut: a.statut,
  }));
}
