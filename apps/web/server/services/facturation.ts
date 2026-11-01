import { randomUUID } from 'node:crypto';

import { verrouillerTete } from '@ha/caisse';
import type { Prisma } from '@ha/db';
import {
  acomptesADeduire,
  creancesDeFacture,
  encaisseNet,
  adresseDuCanal,
  calculerPagination,
  canauxDisponibles,
  centimes,
  clientFactureSchema,
  controlerVenteDirecte,
  envoiDocumentSaisieSchema,
  etatFacture,
  filtreFacturesSchema,
  formaterNumero,
  ligneBrouillonSaisieSchema,
  partPatientDeLaPiece,
  peutGererSerie,
  peutValiderFacture,
  prefixeSerieSchema,
  PREFIXE_SERIE_DEFAUT,
  preparerFacture,
  rendreFactureHtml,
  TAUX_AMO_GENERAL,
  tiersPayantSaisieSchema,
  vendeurFactureSchema,
  venteDirecteSaisieSchema,
  verifierTransition,
  type CanalNotification,
  type Centimes,
  type ContenuFacture,
  type LigneFacture,
  type NatureLigneFacture,
  type NaturePiece,
  type Oreille,
  type Pagination,
  type Perimetre,
  type ResultatControleFacture,
  type StatutFacture,
  type StatutFse,
  type TypeEvenementCaisse,
  type VueFacture,
} from '@ha/domain';

import {
  AccesRefuseError,
  centresSelectionnables,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider } from '../erreurs';
import { rendeurPdf } from '../pdf';
import { centresDuPerimetre } from '../perimetre';
import { ajouterMaillon, chargeDepuisBase, txCaisse } from './chaine-caisse';
import {
  appliquerTransition,
  depuisDate,
  evenementTransition,
  lireDossier,
  versDate,
  type DossierLu,
} from './dossiers';
import {
  evaluerFactures,
  selectionClient,
  selectionVendeur,
  versClient,
  versConsommable,
  versVendeur,
  type FactureEvaluee,
  type PayeursFacture,
} from './factures';
import { decrireCodesLpp, tarifsAudioEnVigueur, versClientLpp } from './lpp';
import { aujourdhui, type Client } from './patients';
import {
  appliquerMouvement,
  debiter,
  ecrireMouvementAccessoire,
  evenementMouvement,
  lireAppareil,
} from './stock';
import { tauxTvaDates } from './taux-tva';

const MESSAGE_DEJA_VALIDEE = 'Cette facture a déjà été validée.';
const MESSAGE_SANS_TARIF_DIRECT = 'La base LPP ne couvre pas la date du jour.';
export const LIGNES_PAR_PAGE_FACTURES = 50;

export interface FactureLue {
  id: string;
  organisationId: string;
  centreId: string;
  patientId: string;
  dossierId: string | null;
  prescriptionId: string | null;
  nature: NaturePiece;
  statut: StatutFacture;
  tauxAmo: number | null;
  tiersPayantAmo: boolean;
  amoConfirmeeLe: Date | null;
}

const selectionFacture = {
  id: true,
  organisationId: true,
  centreId: true,
  patientId: true,
  dossierId: true,
  prescriptionId: true,
  nature: true,
  statut: true,
  tauxAmo: true,
  tiersPayantAmo: true,
  amoConfirmeeLe: true,
} as const;

/** Lit une pièce du client et vérifie le droit sur son centre. */
export async function lireFacture(
  client: Client,
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<FactureLue> {
  const facture = await client.facture.findFirst({
    where: { id: factureId, organisationId: acteur.organisationId },
    select: selectionFacture,
  });
  if (!facture) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, facture.centreId);
  return facture;
}

function exigerBrouillon(facture: FactureLue): void {
  if (facture.statut !== 'BROUILLON' || facture.nature !== 'FACTURE') {
    throw new ErreurSaisie({}, 'Seul un brouillon de facture se modifie.');
  }
}

/**
 * Prochain numéro de la série. La ligne reste verrouillée jusqu'au commit : un rollback rend le numéro,
 * deux validations s'attendent, donc la suite est continue. `ON CONFLICT` couvre la toute première.
 * À VÉRIFIER : continuité et série commune aux factures et aux avoirs, obligations des logiciels de caisse.
 */
export async function attribuerNumero(
  tx: ClientTransaction,
  { organisationId }: UtilisateurConnecte,
  centreId: string,
): Promise<{ numero: string; numeroSequence: number }> {
  const [serie] = await tx.$queryRaw<{ prefixe: string; dernier_numero: number }[]>`
    INSERT INTO "serie_facture" ("centre_id", "organisation_id", "dernier_numero", "updated_at")
    VALUES (${centreId}, ${organisationId}, 1, now())
    ON CONFLICT ("centre_id")
    DO UPDATE SET "dernier_numero" = "serie_facture"."dernier_numero" + 1, "updated_at" = now()
    RETURNING "prefixe", "dernier_numero"`;
  if (!serie) {
    throw new Error('Série de factures introuvable.');
  }
  return {
    numero: formaterNumero(serie.prefixe, serie.dernier_numero),
    numeroSequence: serie.dernier_numero,
  };
}

export function versDonneesLigne(factureId: string, ligne: LigneFacture, rang: number) {
  return {
    factureId,
    rang,
    nature: ligne.nature,
    oreille: ligne.oreille,
    classe: ligne.classe,
    libelle: ligne.libelle,
    codeLpp: ligne.codeLpp,
    codeLppGenerique: ligne.codeLppGenerique,
    codePrestation: ligne.codePrestation,
    numeroSerie: ligne.numeroSerie,
    appareilId: ligne.appareilId,
    accessoireId: ligne.accessoireId,
    quantite: ligne.quantite,
    prixUnitaireCentimes: ligne.prixUnitaire,
    prixTtcCentimes: ligne.prixTTC,
    tauxTva: ligne.tauxTva,
    montantHtCentimes: ligne.montantHT,
    montantTvaCentimes: ligne.montantTva,
    baseRemboursementCentimes: ligne.baseRemboursement,
    amoCentimes: ligne.amo,
    amcCentimes: ligne.amc,
    resteAChargeCentimes: ligne.resteACharge,
  };
}

function totauxEnBase({ totaux }: Pick<ContenuFacture, 'totaux'>) {
  return {
    totalTtcCentimes: totaux.prixTTC,
    totalHtCentimes: totaux.ht,
    totalTvaCentimes: totaux.tva,
    totalAmoCentimes: totaux.amo,
    totalAmcCentimes: totaux.amc,
    totalResteCentimes: totaux.resteACharge,
  };
}

// --- Vente directe --------------------------------------------------------------------------------

/** Évalue une vente directe, au jour courant. Sans prescription : aucun tarif, tout en reste à charge. */
async function evaluerVenteDirecte(
  client: Client,
  facture: FactureLue,
): Promise<FactureEvaluee & { contenu: ContenuFacture | null }> {
  const dateDelivrance = aujourdhui();
  const remboursable = facture.prescriptionId !== null;
  const [centre, patient, couverture, saisies, tauxTva, audio] = await Promise.all([
    client.centre.findUniqueOrThrow({
      where: { id: facture.centreId },
      select: selectionVendeur,
    }),
    client.patient.findUniqueOrThrow({
      where: { id: facture.patientId },
      select: selectionClient,
    }),
    client.couvertureAmo.findUnique({
      where: { patientId: facture.patientId },
      select: {
        c2s: true,
        caisse: true,
        regime: true,
        origine: true,
        derniereLectureVitale: true,
        updatedAt: true,
        finDroits: true,
      },
    }),
    client.ligneFacture.findMany({ where: { factureId: facture.id }, orderBy: { rang: 'asc' } }),
    tauxTvaDates(client),
    tarifsAudioEnVigueur(dateDelivrance, versClientLpp(client)),
  ]);
  if (!audio) {
    const controle: ResultatControleFacture = {
      erreurs: [{ code: 'TARIF_LPP_INDISPONIBLE', oreille: null }],
      avertissements: [],
    };
    return {
      dateDelivrance,
      factureId: facture.id,
      facture: null,
      contenu: null,
      controle,
      etat: etatFacture(controle),
      payeurs: null,
    };
  }
  const codes = remboursable ? saisies.flatMap((l) => (l.codeLpp ? [l.codeLpp] : [])) : [];
  const decrits = await decrireCodesLpp(codes, {
    date: dateDelivrance,
    client: versClientLpp(client),
  });
  const tarifs = new Map(decrits.map((d) => [d.code, d]));
  const contenu = preparerFacture({
    dateNaissance: depuisDate(patient.dateNaissance),
    dateDelivrance,
    c2s: remboursable && (couverture?.c2s ?? false),
    surdicecite: false,
    tauxAMO: facture.tauxAmo ?? 0,
    aides: [],
    consommables: saisies.map((ligne) =>
      versConsommable(ligne, (code) => (code ? tarifs.get(code)?.tarif : null) ?? null),
    ),
    montantAccorde: null,
    tarifs: audio,
    tauxTva,
  });
  const c2s = remboursable && (couverture?.c2s ?? false);
  const controle = controlerVenteDirecte(contenu, {
    remboursable,
    c2s,
    tiersPayantAmo: facture.tiersPayantAmo,
    couvertureAmo: couverture
      ? {
          origine: couverture.origine,
          derniereLectureVitale:
            couverture.derniereLectureVitale &&
            couverture.derniereLectureVitale.toISOString().slice(0, 10),
          modifieeLe: couverture.updatedAt.toISOString(),
          finDroits: couverture.finDroits && depuisDate(couverture.finDroits),
        }
      : null,
    amoConfirmeeLe: facture.amoConfirmeeLe?.toISOString() ?? null,
    vendeur: versVendeur(centre),
    client: versClient(patient),
  });
  return {
    dateDelivrance,
    factureId: facture.id,
    facture: contenu,
    contenu,
    controle,
    etat: etatFacture(controle),
    payeurs: {
      c2s,
      caisse: couverture?.caisse ?? null,
      regime: couverture?.regime ?? null,
      pec: null,
    },
  };
}

/** Ouvre une vente directe. La prescription, facultative, doit être celle du patient (R30). */
export async function creerVenteDirecte(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  if (!peutValiderFacture(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { patientId, centreId, prescriptionId } = valider(venteDirecteSaisieSchema, saisie);
  verifierAccesCentre(acteur, centreId);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, organisationId: acteur.organisationId },
        select: { id: true },
      });
      if (!patient) {
        throw ErreurSaisie.surChamp('patientId', 'Patient inconnu.');
      }
      const prescription =
        prescriptionId === null
          ? null
          : await tx.prescription.findFirst({
              where: { id: prescriptionId, dossier: { patientId } },
              select: { dossier: { select: { devis: { where: { statut: 'SIGNE' } } } } },
            });
      if (prescriptionId !== null && !prescription) {
        throw ErreurSaisie.surChamp(
          'prescriptionId',
          'Cette prescription n’est pas celle du patient.',
        );
      }
      // À VÉRIFIER : taux du devis signé, sinon taux général : aucun texte pour une vente directe (R30).
      const tauxAmo = prescription
        ? (prescription.dossier.devis[0]?.tauxAmo ?? TAUX_AMO_GENERAL.valeur)
        : null;
      return tx.facture.create({
        data: {
          organisationId: acteur.organisationId,
          centreId,
          patientId,
          prescriptionId,
          tauxAmo,
          createdById: acteur.id,
        },
        select: { id: true },
      });
    },
    ({ id: factureId }) => ({
      action: 'CREATE',
      entiteType: 'FACTURE',
      entiteId: factureId,
      patientId,
      centreId,
    }),
  );
  return id;
}

/** L'utilisateur atteste la couverture saisie pour cette vente, comme sur un dossier (R22). */
export async function confirmerCouvertureVente(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      exigerBrouillon(facture);
      const couverture = await tx.couvertureAmo.count({ where: { patientId: facture.patientId } });
      if (couverture === 0) {
        throw new ErreurSaisie({}, 'Renseigner d’abord la couverture AMO du patient.');
      }
      await tx.facture.update({
        where: { id: factureId },
        data: { amoConfirmeeLe: new Date(), amoConfirmeeParId: acteur.id },
      });
      return facture;
    },
    (facture) => evenementPiece('UPDATE', facture, { couvertureAmoConfirmee: true }),
  );
}

/** Ajoute une ligne saisie à un brouillon : vente directe, ou ajout sur une facture de dossier. */
export async function ajouterLigneBrouillon(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<void> {
  const ligne = valider(ligneBrouillonSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      exigerBrouillon(facture);
      const accessoire =
        ligne.accessoireId === null
          ? null
          : await tx.accessoire.findFirst({
              where: { id: ligne.accessoireId, organisationId: acteur.organisationId },
              select: { id: true, nature: true, codeLpp: true },
            });
      if (ligne.accessoireId !== null && accessoire?.nature !== ligne.nature) {
        throw ErreurSaisie.surChamp('accessoireId', 'Article inconnu.');
      }
      const dernier = await tx.ligneFacture.findFirst({
        where: { factureId },
        orderBy: { rang: 'desc' },
        select: { rang: true },
      });
      await tx.ligneFacture.create({
        data: {
          factureId,
          rang: (dernier?.rang ?? 0) + 1,
          nature: ligne.nature,
          libelle: ligne.libelle,
          codeLpp: accessoire?.codeLpp ?? null,
          accessoireId: ligne.accessoireId,
          quantite: ligne.quantite,
          prixUnitaireCentimes: ligne.prixUnitaire,
        },
      });
      return facture;
    },
    (facture) => evenementPiece('UPDATE', facture, { ligneAjoutee: ligne.nature }),
  );
}

export async function retirerLigneBrouillon(
  acteur: UtilisateurConnecte,
  factureId: string,
  ligneId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      exigerBrouillon(facture);
      await tx.ligneFacture.deleteMany({ where: { id: ligneId, factureId } });
      return facture;
    },
    (facture) => evenementPiece('UPDATE', facture, { ligneRetiree: true }),
  );
}

/** Un brouillon de vente directe se clôt sans numéro. Celui d'un dossier reste : il attend sa facture. */
export async function abandonnerBrouillon(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      exigerBrouillon(facture);
      if (facture.dossierId !== null) {
        throw new ErreurSaisie({}, 'La facture d’un dossier ne s’abandonne pas.');
      }
      await tx.facture.update({ where: { id: factureId }, data: { statut: 'ABANDONNEE' } });
      return facture;
    },
    (facture) => evenementPiece('UPDATE', facture, { abandon: true }),
  );
}

export function evenementPiece(
  action: EvenementAudit['action'],
  facture: Pick<FactureLue, 'id' | 'patientId' | 'centreId' | 'dossierId'>,
  details: Readonly<Record<string, unknown>> = {},
): EvenementAudit {
  return {
    action,
    entiteType: 'FACTURE',
    entiteId: facture.id,
    patientId: facture.patientId,
    centreId: facture.centreId,
    details: { dossierId: facture.dossierId, ...details },
  };
}

// --- Validation -----------------------------------------------------------------------------------

/** Acomptes nets pris sur les devis d'un dossier. */
async function acomptesNetsDuDossier(tx: ClientTransaction, dossierId: string): Promise<number> {
  const mouvements = await tx.encaissement.findMany({
    where: { devis: { dossierId } },
    select: { nature: true, montantCentimes: true },
  });
  return encaisseNet(mouvements);
}

/** Effets de la vente d'un dossier : délivrance par oreille, appareils `VENDU`, fin du lien d'essai. */
async function vendreAppareils(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  facture: FactureLue,
  dossier: DossierLu,
  contenu: ContenuFacture,
  jour: string,
): Promise<EvenementAudit[]> {
  const evenements: EvenementAudit[] = [];
  for (const { oreille, appareilId } of contenu.lignes) {
    if (oreille === null || appareilId === null) {
      continue;
    }
    // Source : modele-devis-audio.pdf p. 2 § 5 ; convention-audioprothesistes.pdf, art. 22 § 1, p. 22
    // et art. 27, p. 26 : la date de facturation marque la délivrance, point de départ des 4 ans (R8).
    await tx.delivrance.create({
      data: {
        organisationId: acteur.organisationId,
        patientId: dossier.patientId,
        oreille,
        dateDelivrance: versDate(jour),
        dossierId: dossier.id,
        factureId: facture.id,
        origine: 'DOSSIER',
      },
    });
    const appareil = await lireAppareil(tx, acteur, appareilId);
    const etat = { statut: appareil.statut, patientRattache: appareil.patientId !== null };
    const transition = verifierTransition(etat, 'VENDU', false);
    if (!transition.autorisee) {
      throw new ErreurSaisie({}, 'Cet appareil n’est plus réservé à ce patient.');
    }
    const mouvement = {
      type: 'CHANGEMENT_STATUT',
      statut: 'VENDU',
      centreId: appareil.centreId,
      patientId: dossier.patientId,
      motif: 'Vente à la validation de la facture',
      dossierId: dossier.id,
    } as const;
    await appliquerMouvement(tx, acteur, appareil, mouvement);
    evenements.push(evenementMouvement(appareil, mouvement, appareil.centreId));
    await tx.essaiAppareil.updateMany({
      where: { appareilId, retireLe: null, essai: { dossierId: dossier.id } },
      data: { retireLe: versDate(jour), retireParId: acteur.id },
    });
  }
  return evenements;
}

/** Les piles et accessoires sortent du stock du centre à la facture ; un article hors catalogue, non. */
async function sortirConsommables(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  { centreId }: FactureLue,
  { lignes }: ContenuFacture,
): Promise<EvenementAudit[]> {
  const evenements: EvenementAudit[] = [];
  for (const { accessoireId, quantite } of lignes) {
    if (accessoireId === null) {
      continue;
    }
    const operation = { centreId, accessoireId, quantite, motif: 'Vente à la facture' };
    const quantiteApres = await debiter(tx, operation);
    evenements.push(
      await ecrireMouvementAccessoire(tx, acteur, 'SORTIE', operation, quantiteApres),
    );
  }
  return evenements;
}

/** Facture refusée à la validation : les constats sont ceux de l'écran, relus dans la transaction. */
export class ErreurFactureBloquee extends Error {
  constructor(readonly controle: ResultatControleFacture) {
    super('Cette facture présente des erreurs bloquantes.');
    this.name = 'ErreurFactureBloquee';
  }
}

interface EvaluationValidation {
  readonly evaluee: FactureEvaluee;
  readonly contenu: ContenuFacture;
  readonly dossier: DossierLu | null;
}

async function evaluerPourValidation(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  facture: FactureLue,
): Promise<EvaluationValidation> {
  if (facture.dossierId === null) {
    const evaluee = await evaluerVenteDirecte(tx, facture);
    if (!evaluee.contenu) {
      throw new ErreurSaisie({}, MESSAGE_SANS_TARIF_DIRECT);
    }
    return { evaluee, contenu: evaluee.contenu, dossier: null };
  }
  const dossier = await lireDossier(tx, acteur, facture.dossierId);
  if (dossier.statut !== 'A_FACTURER') {
    throw new ErreurSaisie({}, 'Ce dossier n’est plus à facturer.');
  }
  const evaluee = (await evaluerFactures(acteur, [dossier], tx)).get(dossier.id);
  if (!evaluee?.facture) {
    throw new ErreurSaisie({}, MESSAGE_SANS_TARIF_DIRECT);
  }
  return { evaluee, contenu: evaluee.facture, dossier };
}

/**
 * Une créance par part portée par un organisme, nées avec la facture dans la même transaction.
 * Source : voir `creancesDeFacture`.
 */
async function creerCreances(
  tx: ClientTransaction,
  facture: FactureLue,
  payeurs: PayeursFacture | null,
  totaux: { readonly totalAmoCentimes: number; readonly totalAmcCentimes: number },
  jour: string,
): Promise<void> {
  const creances = creancesDeFacture({
    dateFacture: jour,
    tiersPayantAmo: facture.tiersPayantAmo,
    amo: centimes(totaux.totalAmoCentimes),
    amc: centimes(totaux.totalAmcCentimes),
    c2s: payeurs?.c2s ?? false,
    caisse: payeurs?.caisse ?? null,
    regime: payeurs?.regime ?? null,
    complementaire: payeurs?.pec ?? null,
  });
  await tx.creance.createMany({
    data: creances.map(({ montant, echeanceAttendue, ...creance }) => ({
      ...creance,
      organisationId: facture.organisationId,
      centreId: facture.centreId,
      factureId: facture.id,
      patientId: facture.patientId,
      montantCentimes: montant,
      soldeCentimes: montant,
      dateEmission: versDate(jour),
      echeanceAttendue: versDate(echeanceAttendue),
    })),
  });
}

/**
 * Valide un brouillon dans une seule transaction : relit et recontrôle, attribue le numéro, fige lignes,
 * totaux et instantanés, chaîne, puis applique les effets de la vente. Rien ne survit à un échec, numéro
 * compris. La date de facture est le jour de validation, non antidatable : attribuée sous le verrou de la
 * série, elle garde la série chronologique.
 * Source : modele-devis-audio.pdf p. 2 § 5 ; convention-audioprothesistes.pdf, art. 27, p. 26 (ADR-028).
 */
export async function validerFacture(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<void> {
  if (!peutValiderFacture(acteur.role)) {
    throw new AccesRefuseError();
  }
  const facture = await withAudit(
    acteur,
    async (tx) => {
      const lue = await lireFacture(tx, acteur, factureId);
      exigerBrouillon(lue);
      const { evaluee, contenu, dossier } = await evaluerPourValidation(tx, acteur, lue);
      if (evaluee.controle.erreurs.length > 0) {
        throw new ErreurFactureBloquee(evaluee.controle);
      }
      const { numero, numeroSequence } = await attribuerNumero(tx, acteur, lue.centreId);
      // Une validation concurrente a pu aboutir pendant l'attente du verrou.
      const { statut } = await lireFacture(tx, acteur, factureId);
      if (statut !== 'BROUILLON') {
        throw new ErreurSaisie({}, MESSAGE_DEJA_VALIDEE);
      }
      const jour = aujourdhui();
      const [centre, patient] = await Promise.all([
        tx.centre.findUniqueOrThrow({ where: { id: lue.centreId }, select: selectionVendeur }),
        tx.patient.findUniqueOrThrow({ where: { id: lue.patientId }, select: selectionClient }),
      ]);
      await tx.ligneFacture.deleteMany({ where: { factureId } });
      const lignes = contenu.lignes.map((l, index) => versDonneesLigne(factureId, l, index + 1));
      await tx.ligneFacture.createMany({ data: lignes });
      const totaux = totauxEnBase(contenu);
      const { tiersPayantAmo } = lue;
      const acomptesDeduitsCentimes = lue.dossierId
        ? acomptesADeduire(
            await acomptesNetsDuDossier(tx, lue.dossierId),
            partPatientDeLaPiece({ ...totaux, tiersPayantAmo }),
          )
        : 0;
      const charge = chargeDepuisBase(
        {
          ...lue,
          ...totaux,
          acomptesDeduitsCentimes,
          numero,
          numeroSequence,
          dateFacture: jour,
          factureOrigineId: null,
        },
        lignes,
      );
      const { empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
        centreId: lue.centreId,
        type: 'FACTURE_VALIDEE',
        factureId,
        charge,
      });
      await tx.facture.update({
        where: { id: factureId },
        data: {
          ...totaux,
          acomptesDeduitsCentimes,
          statut: 'VALIDEE',
          numero,
          numeroSequence,
          dateFacture: versDate(jour),
          vendeur: versVendeur(centre),
          client: versClient(patient),
          valideeLe: horodatage,
          valideeParId: acteur.id,
          empreinte,
        },
      });
      await creerCreances(tx, lue, evaluee.payeurs, totaux, jour);
      const evenements = [
        evenementPiece('UPDATE', lue, { numero, nature: 'FACTURE' }),
        ...(dossier ? await vendreAppareils(tx, acteur, lue, dossier, contenu, jour) : []),
        ...(await sortirConsommables(tx, acteur, lue, contenu)),
      ];
      if (dossier) {
        await appliquerTransition(tx, acteur, dossier, 'FACTURE');
        evenements.push(evenementTransition(dossier, 'FACTURE'));
      }
      return { facture: lue, evenements };
    },
    ({ evenements }) => evenements,
  ).then((r) => r.facture);
  await deposerOriginal(acteur, facture).catch(() => undefined);
}

/**
 * Le patient avance la part AMO, ou non : le choix se fait sur le brouillon et se fige à la validation. La C2S
 * l'interdit, ce que `controlerFacture` bloque.
 * Source : convention-audioprothesistes.pdf, art. 27, p. 26 (dispense d'avance).
 */
export async function modifierTiersPayantAmo(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<void> {
  const { tiersPayantAmo } = valider(tiersPayantSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      exigerBrouillon(facture);
      await tx.facture.update({ where: { id: factureId }, data: { tiersPayantAmo } });
      return facture;
    },
    (facture) => evenementPiece('UPDATE', facture, { tiersPayantAmo }),
  );
}

// --- PDF ------------------------------------------------------------------------------------------

async function lireVue(client: Client, factureId: string): Promise<VueFacture> {
  const piece = await client.facture.findUniqueOrThrow({
    where: { id: factureId },
    include: {
      lignes: { orderBy: { rang: 'asc' } },
      factureOrigine: { select: { numero: true, dateFacture: true } },
    },
  });
  const { numero, dateFacture, vendeur, client: acheteur, lignes, factureOrigine, motif } = piece;
  if (numero === null || dateFacture === null) {
    throw new ErreurSaisie({}, 'Seule une pièce validée s’imprime.');
  }
  return {
    nature: piece.nature,
    numero,
    dateFacture: depuisDate(dateFacture),
    vendeur: vendeurFactureSchema.parse(vendeur),
    client: clientFactureSchema.parse(acheteur),
    totaux: {
      prixTTC: centimes(piece.totalTtcCentimes),
      ht: centimes(piece.totalHtCentimes),
      tva: centimes(piece.totalTvaCentimes),
      amo: centimes(piece.totalAmoCentimes),
      amc: centimes(piece.totalAmcCentimes),
      resteACharge: centimes(piece.totalResteCentimes),
    },
    acomptesDeduits: centimes(piece.acomptesDeduitsCentimes),
    tiersPayantAmo: piece.tiersPayantAmo,
    lignes: lignes.map((l) => ({
      nature: l.nature,
      libelle: l.libelle,
      oreille: l.oreille,
      codeLpp: l.codeLpp,
      codePrestation: l.codePrestation,
      numeroSerie: l.numeroSerie,
      quantite: l.quantite,
      prixTTC: centimes(l.prixTtcCentimes),
      tauxTva: l.tauxTva ?? 0,
      montantHT: centimes(l.montantHtCentimes),
      montantTva: centimes(l.montantTvaCentimes),
      baseRemboursement: centimes(l.baseRemboursementCentimes),
      amo: centimes(l.amoCentimes),
      amc: centimes(l.amcCentimes),
      resteACharge: centimes(l.resteAChargeCentimes),
    })),
    origine:
      factureOrigine?.numero && factureOrigine.dateFacture && motif !== null
        ? {
            numero: factureOrigine.numero,
            dateFacture: depuisDate(factureOrigine.dateFacture),
            motif,
          }
        : null,
  };
}

/**
 * Dépose l'original une seule fois, hors transaction : le numéro n'existe qu'après le commit. Un échec ne
 * remet pas la facture en cause : le prochain téléchargement le rend à nouveau depuis le contenu figé.
 */
export async function deposerOriginal(
  acteur: UtilisateurConnecte,
  facture: Pick<FactureLue, 'id'>,
): Promise<string> {
  const client = base(acteur);
  const { pdfCle } = await client.facture.findUniqueOrThrow({
    where: { id: facture.id },
    select: { pdfCle: true },
  });
  if (pdfCle !== null) {
    return pdfCle;
  }
  const html = rendreFactureHtml(await lireVue(client, facture.id), { duplicata: false });
  const contenu = await rendeurPdf().rendre(html);
  const cle = `factures/${randomUUID()}`;
  await documents().put(cle, contenu, 'application/pdf');
  await client.facture.update({ where: { id: facture.id }, data: { pdfCle: cle } });
  return cle;
}

export interface PdfFacture {
  contenu: Uint8Array;
  nomFichier: string;
  duplicata: boolean;
}

/** Marque la sortie : la première est l'original, toute autre un duplicata, journalisé et chaîné. */
export async function enregistrerSortie(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  facture: FactureLue,
  numero: string,
  extra: readonly TypeEvenementCaisse[] = [],
): Promise<{ duplicata: boolean }> {
  // Sous le verrou : deux premières sorties simultanées ne font pas deux originaux.
  await verrouillerTete(txCaisse(tx), acteur.organisationId, facture.centreId);
  const dejaSortie = await tx.evenementCaisse.count({
    where: { factureId: facture.id, type: 'ORIGINAL_EMIS' },
  });
  const duplicata = dejaSortie > 0;
  const types: TypeEvenementCaisse[] = [duplicata ? 'DUPLICATA_EMIS' : 'ORIGINAL_EMIS', ...extra];
  for (const type of types) {
    await ajouterMaillon(tx, acteur, {
      centreId: facture.centreId,
      type,
      factureId: facture.id,
      charge: { factureId: facture.id, numero },
    });
  }
  return { duplicata };
}

export async function numeroFacture(client: Client, factureId: string): Promise<string> {
  const { numero } = await client.facture.findUniqueOrThrow({
    where: { id: factureId },
    select: { numero: true },
  });
  if (numero === null) {
    throw new ErreurSaisie({}, 'Seule une pièce validée s’imprime.');
  }
  return numero;
}

export async function rendreDuplicata(client: Client, factureId: string): Promise<Uint8Array> {
  const html = rendreFactureHtml(await lireVue(client, factureId), { duplicata: true });
  return rendeurPdf().rendre(html);
}

/** Télécharge la pièce : l'original à la première sortie, un duplicata marqué ensuite. */
export async function telechargerPdf(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<PdfFacture> {
  const facture = await lireFacture(base(acteur), acteur, factureId);
  const cle = await deposerOriginal(acteur, facture);
  const { duplicata, numero } = await withAudit(
    acteur,
    async (tx) => {
      const lue = await numeroFacture(tx, factureId);
      return { numero: lue, ...(await enregistrerSortie(tx, acteur, facture, lue)) };
    },
    (sortie) => ({
      ...evenementPiece('PRINT', facture, { numero: sortie.numero }),
      details: { numero: sortie.numero, duplicata: sortie.duplicata },
    }),
  );
  return {
    contenu: duplicata
      ? await rendreDuplicata(base(acteur), factureId)
      : await documents().get(cle),
    nomFichier: `${duplicata ? 'duplicata-' : ''}${numero}.pdf`,
    duplicata,
  };
}

// --- Écrans ---------------------------------------------------------------------------------------

export interface LigneFactureListee {
  id: string;
  nature: NaturePiece;
  statut: StatutFacture;
  numero: string | null;
  dateFacture: string | null;
  patient: string;
  centre: string;
  totalTTC: Centimes;
}

export interface ListeFactures {
  lignes: LigneFactureListee[];
  pagination: Pagination;
}

/** Une liste n'ouvre aucun dossier : pas de READ (ADR-006). Les plus récentes d'abord. */
export async function listerFactures(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeFactures> {
  verifierPerimetre(acteur, perimetre);
  const { page, nature, statut } = valider(filtreFacturesSchema, saisie);
  const centres = centresDuPerimetre(acteur, perimetre);
  const where: Prisma.FactureWhereInput = {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    ...(nature ? { nature } : {}),
    ...(statut ? { statut } : { statut: { not: 'ABANDONNEE' } }),
  };
  const client = base(acteur);
  const total = await client.facture.count({ where });
  const pagination = calculerPagination(page, LIGNES_PAR_PAGE_FACTURES, total);
  const lignes = await client.facture.findMany({
    where,
    orderBy: { id: 'desc' },
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_FACTURES,
    select: {
      id: true,
      nature: true,
      statut: true,
      numero: true,
      dateFacture: true,
      totalTtcCentimes: true,
      centre: { select: { nom: true } },
      patient: { select: { nomNaissance: true, nomUsage: true, prenoms: true } },
    },
  });
  return {
    pagination,
    lignes: lignes.map((l) => ({
      id: l.id,
      nature: l.nature,
      statut: l.statut,
      numero: l.numero,
      dateFacture: l.dateFacture && depuisDate(l.dateFacture),
      patient: `${l.patient.nomUsage ?? l.patient.nomNaissance} ${l.patient.prenoms}`,
      centre: l.centre.nom,
      totalTTC: centimes(l.totalTtcCentimes),
    })),
  };
}

export interface LigneDetail {
  id: string;
  nature: NatureLigneFacture;
  libelle: string;
  oreille: Oreille | null;
  codeLpp: string | null;
  codePrestation: string | null;
  numeroSerie: string | null;
  quantite: number;
  prixTTC: Centimes;
  tauxTva: number | null;
  amo: Centimes;
  amc: Centimes;
  resteACharge: Centimes;
  /** Ce qui reste à créditer sur la ligne, cumul des avoirs déduit. */
  resteACrediter: Centimes;
}

export interface FactureDetaillee {
  id: string;
  nature: NaturePiece;
  statut: StatutFacture;
  numero: string | null;
  dateFacture: string | null;
  centreId: string;
  patientId: string;
  dossierId: string | null;
  patient: string;
  totaux: VueFacture['totaux'];
  lignes: LigneDetail[];
  /** Vente directe en brouillon : recalculée à chaque lecture. */
  evaluation: FactureEvaluee | null;
  tiersPayantAmo: boolean;
  origine: { id: string; numero: string | null } | null;
  avoirs: { id: string; numero: string | null; totalTTC: Centimes }[];
  fse: { statut: StatutFse; motif: string | null; reference: string | null } | null;
  empreinte: string | null;
  /** Canaux où le patient peut recevoir un lien. */
  canaux: CanalNotification[];
}

/** Ouvre une pièce : une ligne READ, comme tout dossier patient. */
export async function obtenirFactureDetail(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<FactureDetaillee> {
  const client = base(acteur);
  const facture = await lireFacture(client, acteur, factureId);
  return withAudit(
    acteur,
    async (tx) => {
      const piece = await tx.facture.findUniqueOrThrow({
        where: { id: factureId },
        include: {
          lignes: { orderBy: { rang: 'asc' } },
          patient: {
            select: {
              nomNaissance: true,
              nomUsage: true,
              prenoms: true,
              telephone: true,
              email: true,
              consentementSms: true,
              consentementEmail: true,
            },
          },
          factureOrigine: { select: { id: true, numero: true } },
          avoirs: {
            where: { statut: 'VALIDEE' },
            orderBy: { id: 'asc' },
            select: { id: true, numero: true, totalTtcCentimes: true },
          },
          fse: { select: { statut: true, motif: true, reference: true } },
        },
      });
      const repris = await tx.ligneFacture.groupBy({
        by: ['ligneOrigineId'],
        where: {
          ligneOrigineId: { in: piece.lignes.map((l) => l.id) },
          facture: { statut: 'VALIDEE' },
        },
        _sum: { prixTtcCentimes: true },
      });
      const brouillonDirect = piece.statut === 'BROUILLON' && piece.dossierId === null;
      return {
        id: piece.id,
        nature: piece.nature,
        statut: piece.statut,
        numero: piece.numero,
        dateFacture: piece.dateFacture && depuisDate(piece.dateFacture),
        centreId: piece.centreId,
        patientId: piece.patientId,
        dossierId: piece.dossierId,
        patient: `${piece.patient.nomUsage ?? piece.patient.nomNaissance} ${piece.patient.prenoms}`,
        totaux: {
          prixTTC: centimes(piece.totalTtcCentimes),
          ht: centimes(piece.totalHtCentimes),
          tva: centimes(piece.totalTvaCentimes),
          amo: centimes(piece.totalAmoCentimes),
          amc: centimes(piece.totalAmcCentimes),
          resteACharge: centimes(piece.totalResteCentimes),
        },
        lignes: piece.lignes.map((l) => ({
          id: l.id,
          nature: l.nature,
          libelle: l.libelle,
          oreille: l.oreille,
          codeLpp: l.codeLpp,
          codePrestation: l.codePrestation,
          numeroSerie: l.numeroSerie,
          quantite: l.quantite,
          prixTTC: centimes(l.prixTtcCentimes),
          tauxTva: l.tauxTva,
          amo: centimes(l.amoCentimes),
          amc: centimes(l.amcCentimes),
          resteACharge: centimes(l.resteAChargeCentimes),
          resteACrediter: centimes(
            l.prixTtcCentimes -
              (repris.find((r) => r.ligneOrigineId === l.id)?._sum.prixTtcCentimes ?? 0),
          ),
        })),
        evaluation: brouillonDirect ? await evaluerVenteDirecte(tx, facture) : null,
        origine: piece.factureOrigine,
        avoirs: piece.avoirs.map((a) => ({
          id: a.id,
          numero: a.numero,
          totalTTC: centimes(a.totalTtcCentimes),
        })),
        fse: piece.fse,
        tiersPayantAmo: piece.tiersPayantAmo,
        empreinte: piece.empreinte,
        canaux: canauxDisponibles(piece.patient),
      };
    },
    () => evenementPiece('READ', facture),
  );
}

export interface PieceDuDossier {
  id: string;
  nature: NaturePiece;
  numero: string | null;
  dateFacture: string | null;
  totalTTC: Centimes;
}

/** Pièces validées d'un dossier, de la plus ancienne à la plus récente. */
export async function piecesDuDossier(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<PieceDuDossier[]> {
  const client = base(acteur);
  await lireDossier(client, acteur, dossierId);
  const pieces = await client.facture.findMany({
    where: { dossierId, statut: 'VALIDEE' },
    orderBy: { numeroSequence: 'asc' },
    select: { id: true, nature: true, numero: true, dateFacture: true, totalTtcCentimes: true },
  });
  return pieces.map((p) => ({
    id: p.id,
    nature: p.nature,
    numero: p.numero,
    dateFacture: p.dateFacture && depuisDate(p.dateFacture),
    totalTTC: centimes(p.totalTtcCentimes),
  }));
}

export interface DonneesVenteDirecte {
  patient: string;
  centres: { id: string; nom: string }[];
  prescriptions: { id: string; libelle: string }[];
}

/** Formulaire d'une vente directe : les centres de l'acteur et les prescriptions du patient. */
export async function donneesVenteDirecte(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<DonneesVenteDirecte> {
  const client = base(acteur);
  const [patient, prescriptions, centres] = await Promise.all([
    client.patient.findFirst({
      where: { id: patientId, organisationId: acteur.organisationId },
      select: { nomNaissance: true, nomUsage: true, prenoms: true },
    }),
    client.prescription.findMany({
      where: { dossier: { patientId } },
      orderBy: { datePrescription: 'desc' },
      select: {
        id: true,
        datePrescription: true,
        prescripteur: { select: { prenom: true, nom: true } },
      },
    }),
    centresSelectionnables(acteur),
  ]);
  if (!patient) {
    throw new AccesRefuseError();
  }
  return {
    patient: `${patient.nomUsage ?? patient.nomNaissance} ${patient.prenoms}`,
    centres: centres.map((c) => ({ id: c.id, nom: c.nom })),
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      libelle: `${depuisDate(p.datePrescription)}, ${p.prescripteur.prenom} ${p.prescripteur.nom}`,
    })),
  };
}

/** Préfixe de la série du centre : celui de la ligne, sinon le défaut, tant qu'aucune pièce n'existe. */
export async function prefixeDuCentre(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<string> {
  verifierAccesCentre(acteur, centreId);
  const serie = await base(acteur).serieFacture.findUnique({
    where: { centreId },
    select: { prefixe: true },
  });
  return serie?.prefixe ?? PREFIXE_SERIE_DEFAUT;
}

/** Change le préfixe des prochains numéros. Les pièces émises gardent le leur, et la suite continue. */
export async function modifierPrefixeSerie(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutGererSerie(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
  const { prefixe } = valider(prefixeSerieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const avant = await tx.serieFacture.findUnique({
        where: { centreId },
        select: { prefixe: true },
      });
      await tx.serieFacture.upsert({
        where: { centreId },
        create: { centreId, organisationId: acteur.organisationId, prefixe },
        update: { prefixe },
      });
      await ajouterMaillon(tx, acteur, {
        centreId,
        type: 'PARAMETRE_MODIFIE',
        charge: {
          parametre: 'PREFIXE_SERIE',
          avant: avant?.prefixe ?? PREFIXE_SERIE_DEFAUT,
          apres: prefixe,
        },
      });
    },
    () => ({
      action: 'UPDATE',
      entiteType: 'SERIE_FACTURE',
      entiteId: centreId,
      centreId,
      details: { prefixe },
    }),
  );
}

// --- Envoi au patient -----------------------------------------------------------------------------

/** Adresse du patient sur le canal choisi, s'il y a consenti. */
export async function adresseEnvoi(
  client: Client,
  patientId: string,
  saisie: unknown,
): Promise<{ canal: CanalNotification; adresse: string }> {
  const { canal } = valider(envoiDocumentSaisieSchema, saisie);
  const patient = await client.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { telephone: true, email: true, consentementSms: true, consentementEmail: true },
  });
  const adresse = adresseDuCanal(patient, canal);
  if (adresse === null) {
    throw ErreurSaisie.surChamp(
      'canal',
      'Le patient n’a pas cette coordonnée, ou n’y a pas consenti.',
    );
  }
  return { canal, adresse };
}
