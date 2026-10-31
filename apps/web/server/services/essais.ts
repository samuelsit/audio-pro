import { randomUUID } from 'node:crypto';

import { prisma } from '@ha/db';
import {
  achatEssaiSaisieSchema,
  calculerPagination,
  changementAppareilSaisieSchema,
  etatEssai,
  extensionDocument,
  filtreEssaisSchema,
  peutConfirmerAchat,
  prolongationEssaiSaisieSchema,
  rdvEssaiSaisieSchema,
  rendreCompteRenduEssaiHtml,
  TYPES_DOCUMENT,
  verifierDocument,
  type AlerteEssai,
  type EtatEssai,
  type IssueEssai,
  type Oreille,
  type OreillesDossier,
  type Pagination,
  type Perimetre,
  type StatutDossier,
  type TypeDocument,
  type TypeRdvEssai,
  type VueCompteRenduEssai,
} from '@ha/domain';
import { z } from 'zod';

import { AccesRefuseError, verifierPerimetre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { rendeurPdf } from '../pdf';
import { centresDuPerimetre } from '../perimetre';
import {
  appliquerTransition,
  depuisDate,
  ErreurConflitDossier,
  evenementTransition,
  lireDossier,
  versDate,
  type DossierLu,
} from './dossiers';
import {
  conclureParAchat,
  etatDeLEssai,
  evenementEssai,
  lireEssaiOuvert,
  poserAppareil,
  retirerAppareilDeLOreille,
  type EssaiLu,
} from './essais-socle';
import { aujourdhui, type Client } from './patients';

export const LIGNES_PAR_PAGE_ESSAIS = 50;
const APPAREILS_PROPOSES_MAX = 200;

const MESSAGE_ESSAI_ABSENT = 'Aucun essai n’est en cours sur ce dossier.';

async function exigerEssaiOuvert(client: Client, dossierId: string): Promise<EssaiLu> {
  const essai = await lireEssaiOuvert(client, dossierId);
  if (!essai) {
    throw new ErreurSaisie({}, MESSAGE_ESSAI_ABSENT);
  }
  return essai;
}

function exigerStatut(dossier: DossierLu, statutAttendu: StatutDossier): void {
  if (dossier.statut !== statutAttendu) {
    throw new ErreurConflitDossier();
  }
}

// --- Rendez-vous ----------------------------------------------------------------------------------

/** Trace un rendez-vous tenu : Doctolib reste l'agenda. Le compte rendu n'entre pas dans le journal. */
export async function ajouterRdv(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(rdvEssaiSaisieSchema, saisie);
  const jour = aujourdhui();
  await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      const essai = await exigerEssaiOuvert(tx, dossierId);
      if (donnees.date > jour || donnees.date < depuisDate(essai.dateDebut)) {
        throw ErreurSaisie.surChamp(
          'date',
          'La date du rendez-vous doit se situer entre le début de l’essai et aujourd’hui.',
        );
      }
      await tx.essaiRdv.create({
        data: {
          essaiId: essai.id,
          date: versDate(donnees.date),
          type: donnees.type,
          compteRendu: donnees.compteRendu,
          createdById: acteur.id,
        },
      });
      return { dossier, essaiId: essai.id };
    },
    ({ dossier, essaiId }) => evenementEssai('UPDATE', essaiId, dossier, { rdv: donnees.type }),
  );
}

// --- Prolongation ---------------------------------------------------------------------------------

const DOUBLON_PROLONGATION = {
  prolongation_essai_essai_id_key: ['dateDemande', 'Cet essai a déjà été prolongé.'],
} as const;

/**
 * Prolongation sur demande écrite du prescripteur, dont le justificatif est obligatoire.
 * Source : convention-audioprothesistes.pdf, art. 18 3°, p. 20.
 * À VÉRIFIER : une seule par essai, même en deçà des 15 jours ; une demande après l'échéance est acceptée.
 * Le justificatif est déposé hors transaction ; si elle échoue ensuite, l'objet déposé est retiré.
 */
export async function enregistrerProlongation(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
  justificatif: Uint8Array,
): Promise<void> {
  const donnees = valider(prolongationEssaiSaisieSchema, saisie);
  const document = verifierDocument(justificatif, 'Joindre la demande écrite du prescripteur.');
  if (!document.valide) {
    throw ErreurSaisie.surChamp('justificatif', document.message);
  }
  if (donnees.dateDemande > aujourdhui()) {
    throw ErreurSaisie.surChamp('dateDemande', 'La date de la demande ne peut pas être future.');
  }
  const client = base();
  await lireDossier(client, acteur, dossierId);
  const lu = await exigerEssaiOuvert(client, dossierId);
  const existante = await client.prolongationEssai.count({ where: { essaiId: lu.id } });
  if (existante > 0) {
    throw ErreurSaisie.surChamp('dateDemande', 'Cet essai a déjà été prolongé.');
  }
  const cle = `prolongations/${randomUUID()}`;
  await documents().put(cle, justificatif, document.type);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const dossier = await lireDossier(tx, acteur, dossierId);
        const essai = await exigerEssaiOuvert(tx, dossierId);
        await tx.prolongationEssai.create({
          data: {
            essaiId: essai.id,
            dateDemande: versDate(donnees.dateDemande),
            jours: donnees.jours,
            motif: donnees.motif,
            justificatifCle: cle,
            justificatifType: document.type,
            justificatifTaille: justificatif.length,
            createdById: acteur.id,
          },
        });
        return { dossier, essaiId: essai.id };
      },
      ({ dossier, essaiId }) =>
        evenementEssai('UPDATE', essaiId, dossier, { prolongationJours: donnees.jours }),
    );
  } catch (erreur) {
    await documents()
      .delete(cle)
      .catch(() => undefined);
    traduireDoublon(erreur, DOUBLON_PROLONGATION, 'Cet essai a déjà été prolongé.');
  }
}

export interface JustificatifProlongation {
  contenu: Uint8Array;
  type: TypeDocument;
  nomFichier: string;
}

/** Ouvre la demande du prescripteur : une ligne READ, le nom d'origine n'étant pas conservé. */
export async function lireJustificatif(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<JustificatifProlongation> {
  const { cle, type } = await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      const essai = await tx.essai.findUnique({ where: { dossierId }, select: { id: true } });
      const prolongation =
        essai &&
        (await tx.prolongationEssai.findUnique({
          where: { essaiId: essai.id },
          select: { justificatifCle: true, justificatifType: true },
        }));
      if (!essai || !prolongation) {
        throw new AccesRefuseError();
      }
      return {
        cle: prolongation.justificatifCle,
        type: prolongation.justificatifType,
        dossier,
        essaiId: essai.id,
      };
    },
    ({ dossier, essaiId }) =>
      evenementEssai('READ', essaiId, dossier, { document: 'JUSTIFICATIF_PROLONGATION' }),
  );
  const typeDocument = z.enum(TYPES_DOCUMENT).parse(type);
  return {
    contenu: await documents().get(cle),
    type: typeDocument,
    nomFichier: `demande-prolongation.${extensionDocument(typeDocument)}`,
  };
}

// --- Fin d'essai ----------------------------------------------------------------------------------

/**
 * Remplace l'appareil d'une oreille : l'ancien revient en stock, l'essai continue et sa date de début ne
 * bouge pas. Tout modèle du stock convient ; s'il diffère du devis, une nouvelle version sera exigée
 * avant la signature (`blocagesSignature`).
 * À VÉRIFIER : un autre modèle relance-t-il les 30 jours ? modele-devis-audio.pdf p. 2 § 3 ne parle que
 * d'une nouvelle période à l'issue d'un échec.
 */
export async function changerAppareilEssai(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
): Promise<void> {
  const { statutAttendu, oreille, numeroSerie, motif } = valider(
    changementAppareilSaisieSchema,
    saisie,
  );
  const jour = aujourdhui();
  await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      exigerStatut(dossier, statutAttendu);
      if (dossier.statut !== 'EN_ESSAI') {
        throw new ErreurSaisie({}, 'L’appareil se change pendant l’essai, avant la signature.');
      }
      const essai = await exigerEssaiOuvert(tx, dossierId);
      const { ancien, evenement } = await retirerAppareilDeLOreille(
        tx,
        acteur,
        dossier,
        essai.id,
        oreille,
        jour,
        motif,
      );
      if (ancien.numeroSerie === numeroSerie) {
        throw ErreurSaisie.surChamp('numeroSerie', 'Cet appareil est déjà celui de l’essai.');
      }
      const pose = await poserAppareil(tx, acteur, dossier, {
        essaiId: essai.id,
        oreille,
        numeroSerie,
        modeleAttendu: null,
        champ: 'numeroSerie',
        jour,
        motif,
      });
      return { dossier, essaiId: essai.id, evenements: [evenement, pose] };
    },
    ({ dossier, essaiId, evenements }): EvenementAudit[] => [
      evenementEssai('UPDATE', essaiId, dossier, { changementOreille: oreille }),
      ...evenements,
    ],
  );
}

/**
 * Conclut l'essai par l'achat, une fois le devis signé (modele-devis-audio.pdf p. 2 § 5) : appareils
 * réservés au patient, dossier à facturer. Aucune délivrance n'est écrite : sa date sera celle de la
 * facturation (étape 11).
 */
export async function confirmerAchat(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutConfirmerAchat(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { statutAttendu } = valider(achatEssaiSaisieSchema, saisie);
  const jour = aujourdhui();
  await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      exigerStatut(dossier, statutAttendu);
      if (dossier.statut !== 'DEVIS_SIGNE') {
        throw new ErreurSaisie({}, 'L’achat se confirme une fois le devis signé.');
      }
      const essai = await exigerEssaiOuvert(tx, dossierId);
      const evenements = await conclureParAchat(tx, acteur, dossier, essai.id, jour);
      await appliquerTransition(tx, acteur, dossier, 'A_FACTURER');
      return { dossier, essaiId: essai.id, evenements };
    },
    ({ dossier, essaiId, evenements }): EvenementAudit[] => [
      evenementEssai('UPDATE', essaiId, dossier, { issue: 'ACHAT' }),
      evenementTransition(dossier, 'A_FACTURER'),
      ...evenements,
    ],
  );
}

// --- Écrans ---------------------------------------------------------------------------------------

export interface AppareilEssaiAffiche {
  id: string;
  appareilId: string;
  oreille: Oreille;
  designation: string;
  numeroSerie: string;
  poseLe: string;
  retireLe: string | null;
  motifRetrait: string | null;
}

export interface RdvEssaiAffiche {
  id: string;
  date: string;
  type: TypeRdvEssai;
  compteRendu: string;
}

export interface ProlongationAffichee {
  dateDemande: string;
  jours: number;
  motif: string;
}

export interface EssaiDetail {
  id: string;
  dateDebut: string;
  dateFin: string | null;
  issue: IssueEssai | null;
  /** Calculé à la date du jour tant que l'essai est ouvert, à sa date de fin sinon. */
  etat: EtatEssai;
  appareils: AppareilEssaiAffiche[];
  rdvs: RdvEssaiAffiche[];
  prolongation: ProlongationAffichee | null;
  /** Un appareil n'est plus du modèle prévu par le devis en vigueur. */
  ecartDevis: boolean;
  actions: {
    ajouterRdv: boolean;
    prolonger: boolean;
    changerAppareil: boolean;
    confirmerAchat: boolean;
  };
}

function designation(appareil: {
  fabricant: { nom: string };
  modele: { gamme: string; nom: string };
}): string {
  return `${appareil.fabricant.nom} ${appareil.modele.gamme} ${appareil.modele.nom}`;
}

const selectionAppareilAffiche = {
  id: true,
  numeroSerie: true,
  modeleId: true,
  fabricant: { select: { nom: true } },
  modele: { select: { gamme: true, nom: true } },
} as const;

/** Modèles de l'offre du devis en vigueur, retenue si elle l'est déjà, sinon celle de l'essai. */
async function modelesDuDevisEnVigueur(
  client: Client,
  dossierId: string,
): Promise<Map<Oreille, string> | null> {
  const devis = await client.devis.findFirst({
    where: { dossierId, statut: { in: ['EMIS', 'SIGNE'] } },
    select: { id: true, offreEssai: true, offreRetenue: true },
  });
  const rubrique = devis?.offreRetenue ?? devis?.offreEssai;
  if (!devis || !rubrique) {
    return null;
  }
  const lignes = await client.devisLigne.findMany({
    where: { offre: { devisId: devis.id, rubrique }, oreille: { not: null } },
    select: { oreille: true, modeleId: true },
  });
  return new Map(
    lignes.flatMap((l) => (l.oreille && l.modeleId ? [[l.oreille, l.modeleId] as const] : [])),
  );
}

/** Essai du dossier, `null` s'il n'a pas démarré. Le dossier est déjà ouvert et journalisé par l'appelant. */
export async function obtenirEssai(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<EssaiDetail | null> {
  const client = base();
  const dossier = await lireDossier(client, acteur, dossierId);
  const essai = await client.essai.findUnique({ where: { dossierId } });
  if (!essai) {
    return null;
  }
  const [liens, rdvs, prolongation, modeles] = await Promise.all([
    client.essaiAppareil.findMany({
      where: { essaiId: essai.id },
      orderBy: [{ poseLe: 'asc' }, { id: 'asc' }],
    }),
    client.essaiRdv.findMany({
      where: { essaiId: essai.id },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
    client.prolongationEssai.findUnique({ where: { essaiId: essai.id } }),
    modelesDuDevisEnVigueur(client, dossierId),
  ]);
  const appareils = await client.appareil.findMany({
    where: { id: { in: liens.map((l) => l.appareilId) } },
    select: selectionAppareilAffiche,
  });
  const ouvert = essai.issue === null;
  const jour = aujourdhui();
  const etat = await etatDeLEssai(client, essai, essai.dateFin ? depuisDate(essai.dateFin) : jour);
  const actifs = liens.filter((l) => l.retireLe === null);
  return {
    id: essai.id,
    dateDebut: depuisDate(essai.dateDebut),
    dateFin: essai.dateFin && depuisDate(essai.dateFin),
    issue: essai.issue,
    etat,
    appareils: liens.flatMap((lien) => {
      const appareil = appareils.find((a) => a.id === lien.appareilId);
      return appareil
        ? [
            {
              id: lien.id,
              appareilId: appareil.id,
              oreille: lien.oreille,
              designation: designation(appareil),
              numeroSerie: appareil.numeroSerie,
              poseLe: depuisDate(lien.poseLe),
              retireLe: lien.retireLe && depuisDate(lien.retireLe),
              motifRetrait: lien.motifRetrait,
            },
          ]
        : [];
    }),
    rdvs: rdvs.map((r) => ({
      id: r.id,
      date: depuisDate(r.date),
      type: r.type,
      compteRendu: r.compteRendu,
    })),
    prolongation: prolongation && {
      dateDemande: depuisDate(prolongation.dateDemande),
      jours: prolongation.jours,
      motif: prolongation.motif,
    },
    ecartDevis:
      ouvert &&
      modeles !== null &&
      actifs.some(
        (l) => modeles.get(l.oreille) !== appareils.find((a) => a.id === l.appareilId)?.modeleId,
      ),
    actions: {
      ajouterRdv: ouvert,
      prolonger: ouvert && prolongation === null,
      changerAppareil: ouvert && dossier.statut === 'EN_ESSAI',
      confirmerAchat: ouvert && dossier.statut === 'DEVIS_SIGNE' && peutConfirmerAchat(acteur.role),
    },
  };
}

export interface AppareilProposable {
  numeroSerie: string;
  libelle: string;
  modeleId: string;
}

/** Appareils du centre du dossier que l'essai peut prendre, pour l'aide à la saisie. */
export async function appareilsProposables(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<AppareilProposable[]> {
  const dossier = await lireDossier(base(), acteur, dossierId);
  const lignes = await prisma().appareil.findMany({
    where: {
      organisationId: acteur.organisationId,
      centreId: dossier.centreId,
      OR: [{ statut: 'EN_STOCK' }, { statut: 'RESERVE', patientId: dossier.patientId }],
    },
    select: selectionAppareilAffiche,
    orderBy: { numeroSerie: 'asc' },
    take: APPAREILS_PROPOSES_MAX,
  });
  return lignes.map((a) => ({
    numeroSerie: a.numeroSerie,
    libelle: designation(a),
    modeleId: a.modeleId,
  }));
}

export interface LigneEssai {
  id: string;
  dossierId: string;
  patient: string;
  centre: string;
  oreilles: OreillesDossier;
  statut: StatutDossier;
  numerosSerie: string[];
  dateDebut: string;
  joursEcoules: number;
  echeance: string;
  joursRestants: number;
  rdvRealises: number;
  alertes: readonly AlerteEssai[];
}

/**
 * Essais sans issue du périmètre, les plus anciens d'abord. Une liste n'ouvre aucun dossier : pas de READ
 * (ADR-006). Aucun champ chiffré n'est lu : le client brut suffit.
 */
export async function listerEssaisEnCours(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<{ lignes: LigneEssai[]; pagination: Pagination }> {
  verifierPerimetre(acteur, perimetre);
  const { page } = valider(filtreEssaisSchema, saisie);
  const centres = centresDuPerimetre(acteur, perimetre);
  const where = {
    organisationId: acteur.organisationId,
    issue: null,
    ...(centres === null ? {} : { dossier: { centreId: { in: [...centres] } } }),
  };
  const total = await prisma().essai.count({ where });
  const pagination = calculerPagination(page, LIGNES_PAR_PAGE_ESSAIS, total);
  const essais = await prisma().essai.findMany({
    where,
    select: {
      id: true,
      dateDebut: true,
      rdvs: { select: { date: true } },
      prolongation: { select: { jours: true } },
      appareils: {
        where: { retireLe: null },
        select: { appareil: { select: { numeroSerie: true } } },
        orderBy: { oreille: 'asc' },
      },
      dossier: {
        select: {
          id: true,
          statut: true,
          oreilles: true,
          centre: { select: { nom: true } },
          patient: { select: { nomNaissance: true, nomUsage: true, prenoms: true } },
        },
      },
    },
    orderBy: [{ dateDebut: 'asc' }, { id: 'asc' }],
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_ESSAIS,
  });
  const jour = aujourdhui();
  return {
    lignes: essais.map((e) => {
      const { patient } = e.dossier;
      const etat = etatEssai({
        debut: depuisDate(e.dateDebut),
        prolongation: e.prolongation && { jours: e.prolongation.jours, demandeEcrite: true },
        rdvs: e.rdvs.map((r) => depuisDate(r.date)),
        aujourdhui: jour,
      });
      return {
        id: e.id,
        dossierId: e.dossier.id,
        patient: `${patient.nomUsage ?? patient.nomNaissance} ${patient.prenoms}`,
        centre: e.dossier.centre.nom,
        oreilles: e.dossier.oreilles,
        statut: e.dossier.statut,
        numerosSerie: e.appareils.map((a) => a.appareil.numeroSerie),
        dateDebut: depuisDate(e.dateDebut),
        joursEcoules: etat.joursEcoules,
        echeance: etat.echeance,
        joursRestants: etat.joursRestants,
        rdvRealises: etat.rdvRealises,
        alertes: etat.alertes,
      };
    }),
    pagination,
  };
}

// --- Compte rendu au prescripteur -----------------------------------------------------------------

export interface DocumentEssai {
  contenu: Uint8Array;
  nomFichier: string;
}

async function vueCompteRendu(
  acteur: UtilisateurConnecte,
  dossier: DossierLu,
): Promise<{ essaiId: string; vue: VueCompteRenduEssai }> {
  const client = base();
  const detail = await obtenirEssai(acteur, dossier.id);
  if (!detail) {
    throw new ErreurSaisie({}, MESSAGE_ESSAI_ABSENT);
  }
  const [centre, praticien, patient, prescription] = await Promise.all([
    client.centre.findUniqueOrThrow({
      where: { id: dossier.centreId },
      select: {
        nom: true,
        raisonSociale: true,
        adresseLigne1: true,
        adresseLigne2: true,
        codePostal: true,
        ville: true,
        telephone: true,
        email: true,
      },
    }),
    client.praticien.findUniqueOrThrow({
      where: { id: dossier.praticienId },
      select: { rpps: true, utilisateur: { select: { prenom: true, nom: true } } },
    }),
    client.patient.findUniqueOrThrow({
      where: { id: dossier.patientId },
      select: { prenoms: true, nomUsage: true, nomNaissance: true, dateNaissance: true },
    }),
    client.prescription.findFirstOrThrow({
      where: { dossierId: dossier.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { prescripteur: { select: { prenom: true, nom: true, cabinet: true } } },
    }),
  ]);
  return {
    essaiId: detail.id,
    vue: {
      entreprise: {
        nom: [centre.raisonSociale, centre.nom].filter(Boolean).join(' – '),
        adresse: [
          centre.adresseLigne1,
          ...(centre.adresseLigne2 === null ? [] : [centre.adresseLigne2]),
          `${centre.codePostal} ${centre.ville}`,
        ],
        telephone: centre.telephone,
        email: centre.email,
      },
      audioprothesiste: {
        prenomNom: `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
        identifiant: praticien.rpps,
      },
      prescripteur: {
        prenomNom: `${prescription.prescripteur.prenom} ${prescription.prescripteur.nom}`,
        cabinet: prescription.prescripteur.cabinet,
      },
      patient: {
        prenomNom: `${patient.prenoms} ${patient.nomUsage ?? patient.nomNaissance}`,
        dateNaissance: depuisDate(patient.dateNaissance),
      },
      lieu: centre.ville,
      dateCourrier: aujourdhui(),
      debut: detail.dateDebut,
      fin: detail.dateFin,
      echeance: detail.etat.echeance,
      issue: detail.issue,
      prolongation: detail.prolongation && {
        dateDemande: detail.prolongation.dateDemande,
        jours: detail.prolongation.jours,
      },
      appareils: detail.appareils.map((a) => ({
        oreille: a.oreille,
        designation: a.designation,
        numeroSerie: a.numeroSerie,
        pose: a.poseLe,
        retrait: a.retireLe,
      })),
      rdvs: detail.rdvs.map((r) => ({
        date: r.date,
        type: r.type,
        compteRendu: r.compteRendu,
      })),
    },
  };
}

/**
 * Courrier de synthèse au prescripteur (convention art. 18 6°, p. 20), rendu à la demande et sans
 * stockage : une ligne PRINT à chaque téléchargement, rien n'est remis si le journal échoue.
 */
export async function compteRenduEssai(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<DocumentEssai> {
  const client = base();
  const dossier = await lireDossier(client, acteur, dossierId);
  const { essaiId, vue } = await vueCompteRendu(acteur, dossier);
  const contenu = await rendeurPdf().rendre(rendreCompteRenduEssaiHtml(vue));
  await withAudit(acteur, async () => undefined, evenementEssai('PRINT', essaiId, dossier));
  return { contenu, nomFichier: 'compte-rendu-essai.pdf' };
}
