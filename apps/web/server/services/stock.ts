import type { Prisma } from '@ha/db';
import {
  annulationVenteSaisieSchema,
  calculerPagination,
  cellulesCsvStock,
  changementStatutSaisieSchema,
  differencesAuditees,
  entetesCsvStock,
  ENTETES_CSV_STOCK_ACCESSOIRES,
  filtreStockSchema,
  LIBELLES_NATURES_ACCESSOIRE,
  ligneCsv,
  MESSAGES_REFUS_TRANSITION,
  modificationAppareilSaisieSchema,
  mouvementAccessoireSaisieSchema,
  normaliserNumeroSerie,
  patientAChoisir,
  peutAccederAuCentre,
  peutAnnulerVente,
  peutCorrigerIdentite,
  peutTransferer,
  peutVoirPrixAchat,
  transfertAccessoireSaisieSchema,
  transfertSaisieSchema,
  transitionsPossibles,
  verifierAnnulationVente,
  verifierTransitionManuelle,
  type FiltreStock,
  type NatureAccessoire,
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
import { auteurDepuisActeur, journaliser, withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';

export const LIGNES_PAR_PAGE_STOCK = 50;
const LOT_EXPORT = 1000;
const LIGNES_HISTORIQUE_ACCESSOIRE = 200;

function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** L'appareil a changé depuis que l'utilisateur l'a vu, ou une opération concurrente est passée avant. */
export class ErreurConflitStock extends ErreurSaisie {
  constructor() {
    super(
      {},
      'Cet appareil vient d’être modifié par ailleurs : rechargez la fiche et recommencez.',
    );
    this.name = 'ErreurConflitStock';
  }
}

// --- Écriture : chemin unique d'un changement de statut ou de centre ---------------------------

export const selectionAppareil = {
  id: true,
  organisationId: true,
  centreId: true,
  statut: true,
  patientId: true,
  numeroSerie: true,
  modeleId: true,
  fabricantId: true,
  referenceBonLivraison: true,
  referenceFactureFabricant: true,
  prixAchatCentimes: true,
  enConsignation: true,
} as const;

export type AppareilLu = Prisma.AppareilGetPayload<{ select: typeof selectionAppareil }>;

/** Lit l'appareil dans la transaction et vérifie le droit sur son centre actuel. */
async function lireAppareil(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  appareilId: string,
): Promise<AppareilLu> {
  const appareil = await tx.appareil.findFirst({
    where: { id: appareilId, organisationId: acteur.organisationId },
    select: selectionAppareil,
  });
  if (!appareil) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, appareil.centreId);
  return appareil;
}

export interface Mouvement {
  readonly type: 'CHANGEMENT_STATUT' | 'TRANSFERT' | 'ANNULATION_VENTE';
  readonly statut: StatutAppareil;
  readonly centreId: string;
  readonly patientId: string | null;
  readonly motif: string;
  /** Dossier qui provoque le mouvement : essai, puis vente (étape 14). */
  readonly dossierId?: string;
}

/**
 * Seule écriture de `statut`, `centreId` et `patientId` : met à jour l'appareil si son état n'a pas bougé
 * depuis sa lecture et ajoute le mouvement dans la même transaction. Sur un conflit, le perdant attend le
 * verrou de la ligne, le `where` est réévalué et aucune ligne ne correspond : tout est annulé.
 */
export async function appliquerMouvement(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  appareil: AppareilLu,
  mouvement: Mouvement,
): Promise<void> {
  const { statut, centreId, patientId, type, motif } = mouvement;
  const { count } = await tx.appareil.updateMany({
    where: {
      id: appareil.id,
      statut: appareil.statut,
      centreId: appareil.centreId,
      patientId: appareil.patientId,
    },
    data: { statut, centreId, patientId },
  });
  if (count !== 1) {
    throw new ErreurConflitStock();
  }
  await tx.mouvementAppareil.create({
    data: {
      organisationId: appareil.organisationId,
      appareilId: appareil.id,
      type,
      utilisateurId: acteur.id,
      statutAvant: appareil.statut,
      statutApres: statut,
      centreAvantId: appareil.centreId,
      centreApresId: centreId,
      // Un appareil rendu garde dans son historique le patient qui le détenait.
      patientId: patientId ?? appareil.patientId,
      dossierId: mouvement.dossierId ?? null,
      motif,
    },
  });
}

/** Le motif n'entre jamais dans le journal : texte libre, chiffré dans le mouvement. */
export function evenementMouvement(
  appareil: AppareilLu,
  mouvement: Mouvement,
  centreId: string,
): EvenementAudit {
  return {
    action: 'UPDATE',
    entiteType: 'APPAREIL',
    entiteId: appareil.id,
    patientId: mouvement.patientId ?? appareil.patientId,
    centreId,
    details: {
      mouvement: mouvement.type,
      statutAvant: appareil.statut,
      statutApres: mouvement.statut,
      centreAvantId: appareil.centreId,
      centreApresId: mouvement.centreId,
    },
  };
}

/** Patient d'une réservation, d'un essai ou d'un prêt : fiche active, accessible à l'utilisateur. */
async function verifierPatient(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<void> {
  const patient = await tx.patient.findFirst({
    where: { id: patientId, organisationId: acteur.organisationId, fusionneDansId: null },
    select: { centreId: true },
  });
  if (!patient || !peutAccederAuCentre(acteur, patient.centreId)) {
    throw ErreurSaisie.surChamp('patientId', 'Patient inconnu.');
  }
}

export async function verifierCentreActif(
  client: Pick<ClientTransaction, 'centre'>,
  acteur: UtilisateurConnecte,
  centreId: string,
  champ: string,
): Promise<void> {
  const centre = await client.centre.findFirst({
    where: { id: centreId, organisationId: acteur.organisationId, actif: true },
    select: { id: true },
  });
  if (!centre) {
    throw ErreurSaisie.surChamp(champ, 'Centre inconnu ou fermé.');
  }
}

/** Le lien reste actif après l'achat, jusqu'à la vente : c'est le dossier qui pilote l'appareil. */
async function appareilTenuParEssai(
  client: Pick<ClientTransaction, 'essaiAppareil'>,
  appareilId: string,
): Promise<boolean> {
  const liens = await client.essaiAppareil.count({ where: { appareilId, retireLe: null } });
  return liens > 0;
}

export async function changerStatut(
  acteur: UtilisateurConnecte,
  appareilId: string,
  saisie: unknown,
): Promise<void> {
  const { statut, statutAttendu, patientId, motif } = valider(changementStatutSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const appareil = await lireAppareil(tx, acteur, appareilId);
      if (appareil.statut !== statutAttendu) {
        throw new ErreurConflitStock();
      }
      if (await appareilTenuParEssai(tx, appareilId)) {
        throw ErreurSaisie.surChamp(
          'statut',
          'Cet appareil est suivi par un essai : passer par le dossier du patient.',
        );
      }
      const transition = verifierTransitionManuelle(
        { statut: appareil.statut, patientRattache: appareil.patientId !== null },
        statut,
        patientId !== null,
      );
      if (!transition.autorisee) {
        throw ErreurSaisie.surChamp(
          transition.code === 'PATIENT_REQUIS' ? 'patientId' : 'statut',
          MESSAGES_REFUS_TRANSITION[transition.code],
        );
      }
      if (transition.effetPatient === 'RATTACHER' && patientId !== null) {
        await verifierPatient(tx, acteur, patientId);
      }
      const patientApres = {
        RATTACHER: patientId,
        CONSERVER: appareil.patientId,
        DETACHER: null,
      }[transition.effetPatient];
      const mouvement: Mouvement = {
        type: 'CHANGEMENT_STATUT',
        statut,
        centreId: appareil.centreId,
        patientId: patientApres,
        motif,
      };
      await appliquerMouvement(tx, acteur, appareil, mouvement);
      return evenementMouvement(appareil, mouvement, appareil.centreId);
    },
    (evenement) => evenement,
  );
}

/** Immédiat, sans statut de transit. Le centre d'arrivée n'a pas besoin d'être rattaché à l'utilisateur. */
export async function transfererAppareil(
  acteur: UtilisateurConnecte,
  appareilId: string,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(transfertSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const appareil = await lireAppareil(tx, acteur, appareilId);
      if (appareil.centreId !== donnees.centreOrigineId) {
        throw new ErreurConflitStock();
      }
      if (!peutTransferer(appareil.statut)) {
        throw ErreurSaisie.surChamp(
          'centreDestinationId',
          'Seul un appareil en stock peut être transféré.',
        );
      }
      if (donnees.centreDestinationId === appareil.centreId) {
        throw ErreurSaisie.surChamp('centreDestinationId', 'Choisir un autre centre.');
      }
      await verifierCentreActif(tx, acteur, donnees.centreDestinationId, 'centreDestinationId');
      const mouvement: Mouvement = {
        type: 'TRANSFERT',
        statut: appareil.statut,
        centreId: donnees.centreDestinationId,
        patientId: null,
        motif: donnees.motif,
      };
      await appliquerMouvement(tx, acteur, appareil, mouvement);
      // Une ligne par centre : le transfert apparaît dans le journal de chacun des deux.
      return [
        evenementMouvement(appareil, mouvement, appareil.centreId),
        evenementMouvement(appareil, mouvement, donnees.centreDestinationId),
      ];
    },
    (evenements) => evenements,
  );
}

/** VENDU → EN_STOCK : seule voie de retour d'un appareil vendu, réservée aux rôles de gestion, motif obligatoire. */
export async function annulerVente(
  acteur: UtilisateurConnecte,
  appareilId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutAnnulerVente(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { motif } = valider(annulationVenteSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const appareil = await lireAppareil(tx, acteur, appareilId);
      if (!verifierAnnulationVente(appareil.statut)) {
        throw ErreurSaisie.surChamp('motif', 'Cet appareil n’est pas vendu.');
      }
      const mouvement: Mouvement = {
        type: 'ANNULATION_VENTE',
        statut: 'EN_STOCK',
        centreId: appareil.centreId,
        patientId: null,
        motif,
      };
      await appliquerMouvement(tx, acteur, appareil, mouvement);
      return evenementMouvement(appareil, mouvement, appareil.centreId);
    },
    (evenement) => evenement,
  );
}

export async function lireModeleActif(
  client: Pick<ClientTransaction, 'modeleAideAuditive'>,
  acteur: UtilisateurConnecte,
  modeleId: string,
): Promise<{ id: string; fabricantId: string }> {
  const modele = await client.modeleAideAuditive.findFirst({
    where: { id: modeleId, organisationId: acteur.organisationId, actif: true },
    select: { id: true, fabricantId: true },
  });
  if (!modele) {
    throw ErreurSaisie.surChamp('modeleId', 'Modèle inconnu.');
  }
  return modele;
}

// --- Modification de la fiche -------------------------------------------------------------------

const DOUBLON_CORRECTION = {
  appareil_fabricant_id_numero_serie_key: [
    'numeroSerie',
    'Ce numéro de série existe déjà chez ce fabricant.',
  ],
} as const;

/**
 * Références d'achat (la facture arrive après le bon de livraison) et, pour l'ADMIN_CLIENT, prix d'achat.
 * Le numéro de série et le modèle ne se corrigent que tant que l'appareil n'a connu que sa réception :
 * au-delà, ils figurent dans des documents.
 */
export async function modifierAppareil(
  acteur: UtilisateurConnecte,
  appareilId: string,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(modificationAppareilSaisieSchema, saisie);
  const voitPrix = peutVoirPrixAchat(acteur.role);
  if (donnees.prixAchatCentimes !== null && !voitPrix) {
    throw new AccesRefuseError();
  }
  const auditer = (avant: AppareilLu, apres: AppareilLu): EvenementAudit => ({
    action: 'UPDATE',
    entiteType: 'APPAREIL',
    entiteId: avant.id,
    centreId: avant.centreId,
    champs: differencesAuditees('APPAREIL', instantaneAudit(avant), instantaneAudit(apres)),
  });
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const avant = await lireAppareil(tx, acteur, appareilId);
        const numeroSerie = donnees.numeroSerie ?? avant.numeroSerie;
        const modeleId = donnees.modeleId ?? avant.modeleId;
        let fabricantId = avant.fabricantId;
        if (numeroSerie !== avant.numeroSerie || modeleId !== avant.modeleId) {
          if (!peutCorrigerIdentite(acteur.role)) {
            throw new AccesRefuseError();
          }
          const mouvements = await tx.mouvementAppareil.count({ where: { appareilId } });
          if (mouvements > 1) {
            throw ErreurSaisie.surChamp(
              'numeroSerie',
              'Cet appareil a déjà bougé : son numéro de série et son modèle ne se corrigent plus.',
            );
          }
          if (modeleId !== avant.modeleId) {
            ({ fabricantId } = await lireModeleActif(base(acteur), acteur, modeleId));
          }
        }
        const apres = await tx.appareil.update({
          where: { id: appareilId },
          data: {
            referenceBonLivraison: donnees.referenceBonLivraison,
            referenceFactureFabricant: donnees.referenceFactureFabricant,
            enConsignation: donnees.enConsignation,
            numeroSerie,
            modeleId,
            fabricantId,
            ...(voitPrix ? { prixAchatCentimes: donnees.prixAchatCentimes } : {}),
          },
          select: selectionAppareil,
        });
        return { avant, apres };
      },
      ({ avant, apres }) => auditer(avant, apres),
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_CORRECTION, 'Ce numéro de série existe déjà.');
  }
}

function instantaneAudit(a: AppareilLu): Record<string, unknown> {
  return {
    numeroSerie: a.numeroSerie,
    modeleId: a.modeleId,
    referenceBonLivraison: a.referenceBonLivraison,
    referenceFactureFabricant: a.referenceFactureFabricant,
    enConsignation: a.enConsignation,
    prixAchatCentimes: a.prixAchatCentimes,
  };
}

// --- Recherche et fiche -------------------------------------------------------------------------

export interface ResultatRechercheSerie {
  /** Null hors périmètre : la fiche n'est pas accessible. */
  id: string | null;
  numeroSerie: string;
  fabricant: string;
  modele: string;
  centre: string;
  statut: StatutAppareil | null;
}

/**
 * Recherche exacte dans toute l'organisation : un numéro peut exister chez plusieurs fabricants. Hors
 * périmètre, on ne révèle que le modèle et le centre, pour savoir où l'appareil se trouve.
 */
export async function rechercherParNumeroSerie(
  acteur: UtilisateurConnecte,
  saisie: string,
): Promise<ResultatRechercheSerie[]> {
  const numeroSerie = normaliserNumeroSerie(saisie);
  if (numeroSerie === '') {
    return [];
  }
  const lignes = await base(acteur).appareil.findMany({
    where: { organisationId: acteur.organisationId, numeroSerie },
    select: {
      id: true,
      numeroSerie: true,
      statut: true,
      centreId: true,
      centre: { select: { nom: true } },
      fabricant: { select: { nom: true } },
      modele: { select: { gamme: true, nom: true } },
    },
    orderBy: { fabricant: { nom: 'asc' } },
  });
  return lignes.map((a) => {
    const accessible = peutAccederAuCentre(acteur, a.centreId);
    return {
      id: accessible ? a.id : null,
      numeroSerie: a.numeroSerie,
      fabricant: a.fabricant.nom,
      modele: `${a.modele.gamme} ${a.modele.nom}`,
      centre: a.centre.nom,
      statut: accessible ? a.statut : null,
    };
  });
}

/** Patient tel qu'affiché : `null` si son centre est hors des droits de l'utilisateur. */
export interface PatientAffiche {
  id: string;
  libelle: string;
}

export interface MouvementAffiche {
  id: string;
  type: 'RECEPTION' | 'CHANGEMENT_STATUT' | 'TRANSFERT' | 'ANNULATION_VENTE';
  horodatage: Date;
  utilisateur: string;
  statutAvant: StatutAppareil | null;
  statutApres: StatutAppareil;
  centreAvant: string | null;
  centreApres: string;
  /** `masque` : le mouvement concerne un patient d'un autre centre, identité et motif sont retirés. */
  patient: PatientAffiche | null;
  patientMasque: boolean;
  dossierId: string | null;
  motif: string | null;
}

export interface FicheAppareil {
  id: string;
  numeroSerie: string;
  fabricant: string;
  modeleId: string;
  modele: string;
  centreId: string;
  centre: string;
  statut: StatutAppareil;
  patient: PatientAffiche | null;
  patientMasque: boolean;
  dateReception: string;
  referenceBonLivraison: string;
  referenceFactureFabricant: string | null;
  /** Toujours null pour un rôle qui n'y a pas droit. */
  prixAchatCentimes: number | null;
  enConsignation: boolean;
  mouvements: MouvementAffiche[];
  transitions: { statut: StatutAppareil; patientAChoisir: boolean }[];
  /** Dossier dont l'essai tient l'appareil : les changements de statut passent par lui. */
  dossierEssaiId: string | null;
  transferable: boolean;
  annulable: boolean;
  corrigeable: boolean;
  voitPrix: boolean;
}

const selectionPatient = {
  id: true,
  centreId: true,
  nomNaissance: true,
  nomUsage: true,
  prenoms: true,
} as const;

const selectionPatientSuivi = {
  ...selectionPatient,
  fusionneDans: { select: selectionPatient },
} as const;

type PatientLu = Prisma.PatientGetPayload<{ select: typeof selectionPatientSuivi }>;

function afficherPatient(
  acteur: UtilisateurConnecte,
  patient: PatientLu | null,
): { patient: PatientAffiche | null; patientMasque: boolean } {
  if (!patient) {
    return { patient: null, patientMasque: false };
  }
  // Une fiche fusionnée pointe toujours vers la fiche conservée, sans chaîne (voir `fusionnerPatients`).
  const fiche = patient.fusionneDans ?? patient;
  if (!peutAccederAuCentre(acteur, fiche.centreId)) {
    return { patient: null, patientMasque: true };
  }
  const nom = fiche.nomUsage ?? fiche.nomNaissance;
  return { patient: { id: fiche.id, libelle: `${nom} ${fiche.prenoms}` }, patientMasque: false };
}

/** Fiche et historique complet. Une ligne READ par patient affiché, car la fiche révèle son appareillage. */
async function lireFicheAppareil(
  acteur: UtilisateurConnecte,
  appareilId: string,
): Promise<FicheAppareil> {
  const client = base(acteur);
  const a = await client.appareil.findFirst({
    where: { id: appareilId, organisationId: acteur.organisationId },
    include: {
      centre: { select: { nom: true } },
      fabricant: { select: { nom: true } },
      modele: { select: { gamme: true, nom: true } },
      patient: { select: selectionPatientSuivi },
    },
  });
  if (!a) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, a.centreId);
  const lignes = await client.mouvementAppareil.findMany({
    where: { appareilId },
    include: {
      utilisateur: { select: { prenom: true, nom: true } },
      centreAvant: { select: { nom: true } },
      centreApres: { select: { nom: true } },
      patient: { select: selectionPatientSuivi },
    },
    orderBy: [{ horodatage: 'desc' }, { id: 'desc' }],
  });
  const mouvements = lignes.map((m): MouvementAffiche => {
    const affiche = afficherPatient(acteur, m.patient);
    return {
      id: m.id,
      type: m.type,
      horodatage: m.horodatage,
      utilisateur: `${m.utilisateur.prenom} ${m.utilisateur.nom}`,
      statutAvant: m.statutAvant,
      statutApres: m.statutApres,
      centreAvant: m.centreAvant?.nom ?? null,
      centreApres: m.centreApres.nom,
      ...affiche,
      dossierId: m.dossierId,
      motif: affiche.patientMasque ? null : m.motif,
    };
  });
  const etat = { statut: a.statut, patientRattache: a.patientId !== null };
  const voitPrix = peutVoirPrixAchat(acteur.role);
  const lienEssai = await client.essaiAppareil.findFirst({
    where: { appareilId, retireLe: null },
    select: { essai: { select: { dossierId: true } } },
  });
  const fiche: FicheAppareil = {
    id: a.id,
    numeroSerie: a.numeroSerie,
    fabricant: a.fabricant.nom,
    modeleId: a.modeleId,
    modele: `${a.modele.gamme} ${a.modele.nom}`,
    centreId: a.centreId,
    centre: a.centre.nom,
    statut: a.statut,
    ...afficherPatient(acteur, a.patient),
    dateReception: depuisDate(a.dateReception),
    referenceBonLivraison: a.referenceBonLivraison,
    referenceFactureFabricant: a.referenceFactureFabricant,
    prixAchatCentimes: voitPrix ? a.prixAchatCentimes : null,
    enConsignation: a.enConsignation,
    mouvements,
    transitions: lienEssai
      ? []
      : transitionsPossibles(etat).map((statut) => ({
          statut,
          patientAChoisir: patientAChoisir(etat, statut),
        })),
    dossierEssaiId: lienEssai?.essai.dossierId ?? null,
    transferable: peutTransferer(a.statut),
    annulable: verifierAnnulationVente(a.statut) && peutAnnulerVente(acteur.role),
    corrigeable: lignes.length === 1 && peutCorrigerIdentite(acteur.role),
    voitPrix,
  };
  return fiche;
}

/**
 * Lit la fiche puis journalise, sans transaction : Prisma charge ces relations en parallèle, sur d'autres
 * connexions. Rien n'est renvoyé si le journal échoue.
 */
export async function obtenirFicheAppareil(
  acteur: UtilisateurConnecte,
  appareilId: string,
): Promise<FicheAppareil> {
  const fiche = await lireFicheAppareil(acteur, appareilId);
  const patients = new Set(
    [fiche.patient, ...fiche.mouvements.map((m) => m.patient)].flatMap((p) => (p ? [p.id] : [])),
  );
  const lecture = { action: 'READ', entiteType: 'APPAREIL', entiteId: fiche.id } as const;
  const centreId = fiche.centreId;
  const evenements: EvenementAudit[] =
    patients.size === 0
      ? [{ ...lecture, centreId }]
      : [...patients].map((patientId) => ({ ...lecture, centreId, patientId }));
  await journaliser(base(acteur), auteurDepuisActeur(acteur), evenements);
  return fiche;
}

// --- Liste et export ----------------------------------------------------------------------------

export interface LigneStock {
  id: string;
  numeroSerie: string;
  centre: string;
  fabricant: string;
  gamme: string;
  modele: string;
  statut: StatutAppareil;
  dateReception: string;
  referenceBonLivraison: string;
  enConsignation: boolean;
}

const selectionListe = {
  id: true,
  numeroSerie: true,
  statut: true,
  dateReception: true,
  referenceBonLivraison: true,
  referenceFactureFabricant: true,
  prixAchatCentimes: true,
  enConsignation: true,
  centre: { select: { nom: true } },
  fabricant: { select: { nom: true } },
  modele: { select: { gamme: true, nom: true } },
} as const;

const ORDRE_STOCK = [
  { dateReception: 'desc' },
  { id: 'desc' },
] satisfies Prisma.AppareilOrderByWithRelationInput[];

function clauseStock(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  filtre: FiltreStock,
): Prisma.AppareilWhereInput {
  const centres = centresDuPerimetre(acteur, perimetre);
  return {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    ...(filtre.statut ? { statut: filtre.statut } : {}),
    ...(filtre.modeleId ? { modeleId: filtre.modeleId } : {}),
    ...(filtre.fabricantId ? { fabricantId: filtre.fabricantId } : {}),
  };
}

export async function listerStock(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<{ lignes: LigneStock[]; pagination: Pagination; filtre: FiltreStock }> {
  verifierPerimetre(acteur, perimetre);
  const filtre = valider(filtreStockSchema, saisie);
  const where = clauseStock(acteur, perimetre, filtre);
  const total = await base(acteur).appareil.count({ where });
  const pagination = calculerPagination(filtre.page, LIGNES_PAR_PAGE_STOCK, total);
  const lignes = await base(acteur).appareil.findMany({
    where,
    select: selectionListe,
    orderBy: ORDRE_STOCK,
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_STOCK,
  });
  return {
    lignes: lignes.map((a) => ({
      id: a.id,
      numeroSerie: a.numeroSerie,
      centre: a.centre.nom,
      fabricant: a.fabricant.nom,
      gamme: a.modele.gamme,
      modele: a.modele.nom,
      statut: a.statut,
      dateReception: depuisDate(a.dateReception),
      referenceBonLivraison: a.referenceBonLivraison,
      enConsignation: a.enConsignation,
    })),
    pagination,
    filtre,
  };
}

/** Export CSV journalisé, produit par lots. Aucune identité de patient ; prix réservé aux rôles de gestion. */
export async function exporterStock(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<AsyncGenerator<string>> {
  verifierPerimetre(acteur, perimetre);
  const filtre = valider(filtreStockSchema, saisie);
  const avecPrix = peutVoirPrixAchat(acteur.role);
  const filtres = Object.fromEntries(Object.entries(filtre).filter(([cle]) => cle !== 'page'));
  await journaliser(base(acteur), auteurDepuisActeur(acteur), {
    action: 'EXPORT',
    entiteType: 'APPAREIL',
    centreId: perimetre.type === 'centre' ? perimetre.centreId : null,
    details: { format: 'CSV', filtres },
  });
  const where = clauseStock(acteur, perimetre, filtre);

  async function* lignes(): AsyncGenerator<string> {
    yield ligneCsv(entetesCsvStock(avecPrix));
    let curseur: string | undefined;
    for (;;) {
      const lot = await base(acteur).appareil.findMany({
        where,
        select: selectionListe,
        orderBy: ORDRE_STOCK,
        take: LOT_EXPORT,
        ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
      });
      for (const a of lot) {
        yield ligneCsv(
          cellulesCsvStock(
            {
              centre: a.centre.nom,
              fabricant: a.fabricant.nom,
              gamme: a.modele.gamme,
              modele: a.modele.nom,
              numeroSerie: a.numeroSerie,
              statut: a.statut,
              dateReception: depuisDate(a.dateReception),
              referenceBonLivraison: a.referenceBonLivraison,
              referenceFactureFabricant: a.referenceFactureFabricant,
              enConsignation: a.enConsignation,
              prixAchatCentimes: a.prixAchatCentimes,
            },
            avecPrix,
          ),
        );
      }
      if (lot.length < LOT_EXPORT) {
        return;
      }
      curseur = lot.at(-1)?.id;
    }
  }
  return lignes();
}

/** Centres actifs proposés comme destination d'un transfert, le centre de départ retiré s'il est connu. */
export async function centresDeDestination(
  acteur: UtilisateurConnecte,
  centreId: string | null,
): Promise<{ id: string; nom: string }[]> {
  return base(acteur).centre.findMany({
    where: {
      organisationId: acteur.organisationId,
      actif: true,
      ...(centreId === null ? {} : { id: { not: centreId } }),
    },
    select: { id: true, nom: true },
    orderBy: { nom: 'asc' },
  });
}

// --- Accessoires et piles -----------------------------------------------------------------------

export interface LigneStockAccessoire {
  centreId: string;
  centre: string;
  accessoireId: string;
  accessoire: string;
  nature: NatureAccessoire;
  quantite: number;
}

export interface MouvementAccessoireAffiche {
  id: string;
  type:
    | 'ENTREE'
    | 'SORTIE'
    | 'TRANSFERT_SORTANT'
    | 'TRANSFERT_ENTRANT'
    | 'INVENTAIRE_ENTREE'
    | 'INVENTAIRE_SORTIE';
  centre: string;
  quantite: number;
  quantiteApres: number;
  horodatage: Date;
  utilisateur: string;
  motif: string;
}

export async function verifierAccessoire(
  client: Pick<ClientTransaction, 'accessoire'>,
  acteur: UtilisateurConnecte,
  accessoireId: string,
): Promise<void> {
  const accessoire = await client.accessoire.findFirst({
    where: { id: accessoireId, organisationId: acteur.organisationId },
    select: { id: true },
  });
  if (!accessoire) {
    throw ErreurSaisie.surChamp('accessoireId', 'Accessoire inconnu.');
  }
}

type TypeAccessoire = MouvementAccessoireAffiche['type'];

export interface OperationAccessoire {
  readonly centreId: string;
  readonly accessoireId: string;
  readonly quantite: number;
  readonly motif: string;
  /** Commande fabricant à l'origine d'une entrée (étape 17). */
  readonly commandeId?: string | null;
}

export async function ecrireMouvementAccessoire(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  type: TypeAccessoire,
  operation: OperationAccessoire,
  quantiteApres: number,
): Promise<EvenementAudit> {
  const { centreId, accessoireId, quantite, motif, commandeId = null } = operation;
  await tx.mouvementAccessoire.create({
    data: {
      organisationId: acteur.organisationId,
      centreId,
      accessoireId,
      type,
      quantite,
      quantiteApres,
      utilisateurId: acteur.id,
      commandeId,
      motif,
    },
  });
  return {
    action: 'UPDATE',
    entiteType: 'STOCK_ACCESSOIRE',
    entiteId: accessoireId,
    centreId,
    details: { mouvement: type, quantite, quantiteApres },
  };
}

/** Incrément atomique : la ligne du centre est créée au premier mouvement. */
export async function crediter(
  tx: ClientTransaction,
  { centreId, accessoireId, quantite }: OperationAccessoire,
): Promise<number> {
  const ligne = await tx.stockAccessoire.upsert({
    where: { centreId_accessoireId: { centreId, accessoireId } },
    create: { centreId, accessoireId, quantite },
    update: { quantite: { increment: quantite } },
    select: { quantite: true },
  });
  return ligne.quantite;
}

/** Décrément atomique, conditionné à une quantité suffisante : deux sorties simultanées sont sérialisées. */
export async function debiter(
  tx: ClientTransaction,
  { centreId, accessoireId, quantite }: OperationAccessoire,
): Promise<number> {
  const [ligne] = await tx.stockAccessoire.updateManyAndReturn({
    where: { centreId, accessoireId, quantite: { gte: quantite } },
    data: { quantite: { decrement: quantite } },
    select: { quantite: true },
  });
  if (!ligne) {
    throw ErreurSaisie.surChamp('quantite', 'Stock insuffisant dans ce centre.');
  }
  return ligne.quantite;
}

export async function entreeAccessoire(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  const operation = valider(mouvementAccessoireSaisieSchema, saisie);
  verifierAccesCentre(acteur, operation.centreId);
  await verifierCentreActif(base(acteur), acteur, operation.centreId, 'centreId');
  await verifierAccessoire(base(acteur), acteur, operation.accessoireId);
  await withAudit(
    acteur,
    async (tx) => {
      const quantiteApres = await crediter(tx, operation);
      return ecrireMouvementAccessoire(tx, acteur, 'ENTREE', operation, quantiteApres);
    },
    (evenement) => evenement,
  );
}

export async function sortieAccessoire(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  const operation = valider(mouvementAccessoireSaisieSchema, saisie);
  verifierAccesCentre(acteur, operation.centreId);
  await verifierAccessoire(base(acteur), acteur, operation.accessoireId);
  await withAudit(
    acteur,
    async (tx) => {
      const quantiteApres = await debiter(tx, operation);
      return ecrireMouvementAccessoire(tx, acteur, 'SORTIE', operation, quantiteApres);
    },
    (evenement) => evenement,
  );
}

export async function transfererAccessoire(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  const { centreDestinationId, ...operation } = valider(transfertAccessoireSaisieSchema, saisie);
  verifierAccesCentre(acteur, operation.centreId);
  await verifierCentreActif(base(acteur), acteur, centreDestinationId, 'centreDestinationId');
  await verifierAccessoire(base(acteur), acteur, operation.accessoireId);
  const arrivee = { ...operation, centreId: centreDestinationId };
  await withAudit(
    acteur,
    async (tx) => {
      const resteDepart = await debiter(tx, operation);
      const totalArrivee = await crediter(tx, arrivee);
      return [
        await ecrireMouvementAccessoire(tx, acteur, 'TRANSFERT_SORTANT', operation, resteDepart),
        await ecrireMouvementAccessoire(tx, acteur, 'TRANSFERT_ENTRANT', arrivee, totalArrivee),
      ];
    },
    (evenements) => evenements,
  );
}

export async function listerStockAccessoires(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<LigneStockAccessoire[]> {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const lignes = await base(acteur).stockAccessoire.findMany({
    where: {
      accessoire: { organisationId: acteur.organisationId },
      ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    },
    select: {
      centreId: true,
      accessoireId: true,
      quantite: true,
      centre: { select: { nom: true } },
      accessoire: { select: { nom: true, nature: true } },
    },
    orderBy: [{ centre: { nom: 'asc' } }, { accessoire: { nom: 'asc' } }],
  });
  return lignes.map((l) => ({
    centreId: l.centreId,
    centre: l.centre.nom,
    accessoireId: l.accessoireId,
    accessoire: l.accessoire.nom,
    nature: l.accessoire.nature,
    quantite: l.quantite,
  }));
}

export async function exporterStockAccessoires(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<AsyncGenerator<string>> {
  const stock = await listerStockAccessoires(acteur, perimetre);
  await journaliser(base(acteur), auteurDepuisActeur(acteur), {
    action: 'EXPORT',
    entiteType: 'STOCK_ACCESSOIRE',
    centreId: perimetre.type === 'centre' ? perimetre.centreId : null,
    details: { format: 'CSV' },
  });
  async function* lignes(): AsyncGenerator<string> {
    yield ligneCsv(ENTETES_CSV_STOCK_ACCESSOIRES);
    for (const l of stock) {
      yield ligneCsv([l.centre, l.accessoire, LIBELLES_NATURES_ACCESSOIRE[l.nature], l.quantite]);
    }
  }
  return lignes();
}

/** Derniers mouvements d'un accessoire dans les centres du périmètre. */
export async function historiqueAccessoire(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  accessoireId: string,
): Promise<MouvementAccessoireAffiche[]> {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const lignes = await base(acteur).mouvementAccessoire.findMany({
    where: {
      organisationId: acteur.organisationId,
      accessoireId,
      ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    },
    include: {
      centre: { select: { nom: true } },
      utilisateur: { select: { prenom: true, nom: true } },
    },
    orderBy: [{ horodatage: 'desc' }, { id: 'desc' }],
    take: LIGNES_HISTORIQUE_ACCESSOIRE,
  });
  return lignes.map((m) => ({
    id: m.id,
    type: m.type,
    centre: m.centre.nom,
    quantite: m.quantite,
    quantiteApres: m.quantiteApres,
    horodatage: m.horodatage,
    utilisateur: `${m.utilisateur.prenom} ${m.utilisateur.nom}`,
    motif: m.motif,
  }));
}
