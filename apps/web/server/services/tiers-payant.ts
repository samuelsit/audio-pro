import { randomUUID } from 'node:crypto';

import { verrouillerTete } from '@ha/caisse';
import type { Prisma } from '@ha/db';
import {
  bornesTranche,
  calculerPagination,
  centimes,
  chargeReglement,
  chargeRegularisation,
  echeanceAmc,
  echeanceAmo,
  ecartReglementSaisieSchema,
  ecartSaisieSchema,
  filtreCreancesSchema,
  filtreListeSchema,
  filtreReglementsSchema,
  formatEuros,
  imputerAvoir,
  LIBELLES_STATUTS_CREANCE,
  LIBELLES_TRANCHES_ANCIENNETE,
  lettrageSaisieSchema,
  ligneCsv,
  MESSAGES_REFUS_LETTRAGE,
  motifSaisieSchema,
  peutRegulariserTiersPayant,
  peutSuivreTiersPayant,
  reglementSaisieSchema,
  rejetSaisieSchema,
  resolutionRejetSaisieSchema,
  resteDuReglement,
  statutCreance,
  syntheseCreances,
  trancheAnciennete,
  TYPE_MAILLON_REGLEMENT,
  verifierLettrage,
  type Centimes,
  type FiltreCreances,
  type LigneSynthese,
  type NatureRegularisation,
  type OrigineReglement,
  type Pagination,
  type Perimetre,
  type ReglementAChainer,
  type RegularisationAChainer,
  type ResolutionRejet,
  type ResteParType,
  type StatutCreance,
  type StatutFse,
  type TrancheAnciennete,
  type TypeCreance,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { auteurDepuisActeur, journaliser, withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { ajouterMaillon, hacheur, txCaisse } from './chaine-caisse';
import { depuisDate, versDate } from './dossiers';
import { aujourdhui } from './patients';

export const LIGNES_PAR_PAGE_TIERS_PAYANT = 50;
const LOT_EXPORT = 1000;

const MESSAGE_SOLDE = 'Le montant dépasse le solde de cette créance.';
const MESSAGE_CREANCE_SOLDEE = 'Cette créance n’a plus de solde à traiter.';
const MESSAGE_RESTE = 'Le montant dépasse ce qu’il reste à lettrer sur cette part.';

function exigerSuivi(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutSuivreTiersPayant(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

function exigerRegularisation(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutRegulariserTiersPayant(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

function verrou(tx: ClientTransaction, acteur: UtilisateurConnecte, centreId: string) {
  return verrouillerTete(txCaisse(tx), acteur.organisationId, centreId);
}

function evenementCreance(
  action: EvenementAudit['action'],
  creance: { readonly id: string; readonly centreId: string; readonly patientId: string },
  details: Readonly<Record<string, unknown>>,
): EvenementAudit {
  return {
    action,
    entiteType: 'CREANCE',
    entiteId: creance.id,
    patientId: creance.patientId,
    centreId: creance.centreId,
    details,
  };
}

function evenementReglement(
  action: EvenementAudit['action'],
  id: string,
  centreId: string,
  details: Readonly<Record<string, unknown>>,
): EvenementAudit {
  return { action, entiteType: 'REGLEMENT_ORGANISME', entiteId: id, centreId, details };
}

async function lireCreance(
  client: Pick<ClientTransaction, 'creance'>,
  acteur: UtilisateurConnecte,
  creanceId: string,
) {
  const creance = await client.creance.findFirst({
    where: { id: creanceId, organisationId: acteur.organisationId },
  });
  if (!creance) {
    throw new AccesRefuseError();
  }
  return creance;
}

async function lireReglement(
  client: Pick<ClientTransaction, 'reglementOrganisme'>,
  acteur: UtilisateurConnecte,
  reglementId: string,
) {
  const reglement = await client.reglementOrganisme.findFirst({
    where: { id: reglementId, organisationId: acteur.organisationId },
  });
  if (!reglement) {
    throw new AccesRefuseError();
  }
  return reglement;
}

// --- Écritures chaînées ---------------------------------------------------------------------------

/** Écrit le règlement et son maillon, dans cette transaction. L'import NOEMIE passera par là (étape 26). */
export async function ecrireReglement(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  centreId: string,
  reglement: Omit<ReglementAChainer, 'id'>,
): Promise<string> {
  const id = randomUUID();
  const complet: ReglementAChainer = { ...reglement, id };
  const { rang, empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
    centreId,
    type: TYPE_MAILLON_REGLEMENT[reglement.origineId === null ? 'RECU' : 'ANNULE'],
    charge: chargeReglement(complet, hacheur),
  });
  await tx.reglementOrganisme.create({
    data: {
      ...complet,
      dateReglement: versDate(reglement.dateReglement),
      resteALettrerCentimes:
        reglement.origineId === null ? reglement.partAmoCentimes + reglement.partAmcCentimes : 0,
      organisationId: acteur.organisationId,
      centreId,
      rang,
      empreinte,
      acteurId: acteur.id,
      createdAt: horodatage,
    },
  });
  return id;
}

async function ecrireRegularisation(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  centreId: string,
  regularisation: Omit<RegularisationAChainer, 'id'>,
): Promise<string> {
  const id = randomUUID();
  const complet: RegularisationAChainer = { ...regularisation, id };
  const { rang, empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
    centreId,
    type: 'REGULARISATION_ORGANISME',
    charge: chargeRegularisation(complet, hacheur),
  });
  await tx.regularisationCreance.create({
    data: {
      ...complet,
      organisationId: acteur.organisationId,
      centreId,
      rang,
      empreinte,
      acteurId: acteur.id,
      createdAt: horodatage,
    },
  });
  return id;
}

type CreanceLue = Awaited<ReturnType<typeof lireCreance>>;

/** Perte ou transfert : la régularisation et le solde de la créance évoluent ensemble. */
async function regulariserCreance(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  creance: CreanceLue,
  nature: Extract<NatureRegularisation, 'ECART_PERTE' | 'TRANSFERT_PATIENT'>,
  montantCentimes: number,
  motif: string,
): Promise<void> {
  if (montantCentimes > creance.soldeCentimes) {
    throw new ErreurSaisie({}, MESSAGE_SOLDE);
  }
  await ecrireRegularisation(tx, acteur, creance.centreId, {
    origineId: null,
    creanceId: creance.id,
    reglementId: null,
    type: creance.type,
    nature,
    montantCentimes,
    motif,
  });
  await tx.creance.update({
    where: { id: creance.id },
    data: { soldeCentimes: creance.soldeCentimes - montantCentimes },
  });
}

// --- Facture et avoir -----------------------------------------------------------------------------

async function netParNature(
  tx: ClientTransaction,
  creanceId: string,
): Promise<{ transferts: number; pertes: number }> {
  const lignes = await tx.regularisationCreance.findMany({
    where: { creanceId },
    select: { nature: true, montantCentimes: true },
  });
  const net = (nature: NatureRegularisation) =>
    lignes
      .filter((l) => l.nature === nature)
      .reduce((total, { montantCentimes }) => total + montantCentimes, 0);
  return { transferts: net('TRANSFERT_PATIENT'), pertes: net('ECART_PERTE') };
}

/**
 * Répercute un avoir sur les créances de sa facture, voir `imputerAvoir`. Appelée dans la transaction de l'avoir, qui
 * tient déjà le verrou de chaîne. Une facture sans créance sur cette part n'a rien à corriger.
 */
export async function imputerAvoirSurCreances(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  factureId: string,
  parts: { readonly amo: Centimes; readonly amc: Centimes },
): Promise<void> {
  const creances = await tx.creance.findMany({ where: { factureId } });
  for (const creance of creances) {
    const part = creance.type === 'AMO' ? parts.amo : parts.amc;
    if (part === 0) {
      continue;
    }
    const { transferts, pertes } = await netParNature(tx, creance.id);
    const imputation = imputerAvoir(part, {
      soldeCentimes: creance.soldeCentimes,
      transfertsCentimes: transferts,
      pertesCentimes: pertes,
    });
    const contrePasser = async (nature: NatureRegularisation, montant: number) => {
      if (montant > 0) {
        await ecrireRegularisation(tx, acteur, creance.centreId, {
          origineId: null,
          creanceId: creance.id,
          reglementId: null,
          type: creance.type,
          nature,
          montantCentimes: -montant,
          motif: 'Contre-passation par avoir',
        });
      }
    };
    await contrePasser('TRANSFERT_PATIENT', imputation.transfert);
    await contrePasser('ECART_PERTE', imputation.perte);
    await tx.creance.update({
      where: { id: creance.id },
      data: { soldeCentimes: imputation.nouveauSolde },
    });
  }
}

/**
 * Une FSE acceptée remplace la date de facture comme départ de l'échéance de la caisse. Une part accordée par une
 * complémentaire porte toujours un numéro d'accord : elle garde son délai.
 * À VÉRIFIER : l'ARL n'est pas connu avant l'étape 26, l'acceptation en tient lieu (R42).
 */
export async function replanifierCreancesCaisse(
  tx: ClientTransaction,
  factureId: string,
  jour: string,
): Promise<void> {
  await tx.creance.updateMany({
    where: { factureId, OR: [{ type: 'AMO' }, { numeroAccord: null }] },
    data: { echeanceAttendue: versDate(echeanceAmo(jour)) },
  });
}

// --- Règlements -----------------------------------------------------------------------------------

/** Saisit un virement reçu, chaîné et écrit en comptabilité dès réception. */
export async function enregistrerReglement(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<string> {
  exigerSuivi(acteur, centreId);
  const donnees = valider(reglementSaisieSchema, saisie);
  if (donnees.dateReglement > aujourdhui()) {
    throw ErreurSaisie.surChamp(
      'dateReglement',
      'Un règlement reçu ne peut pas être daté du futur.',
    );
  }
  return withAudit(
    acteur,
    async (tx) => {
      const complementaire = donnees.complementaireId
        ? await tx.complementaire.findUnique({
            where: { id: donnees.complementaireId },
            select: { nom: true },
          })
        : null;
      const organisme = complementaire?.nom ?? donnees.organisme;
      if (organisme === null) {
        throw ErreurSaisie.surChamp('organisme', 'Choisir l’organisme.');
      }
      await verrou(tx, acteur, centreId);
      const doublon = await tx.reglementOrganisme.count({
        where: {
          centreId,
          organisme,
          reference: donnees.reference,
          origineId: null,
          inverses: { none: {} },
        },
      });
      if (doublon > 0) {
        throw ErreurSaisie.surChamp('reference', 'Ce virement est déjà saisi pour cet organisme.');
      }
      return ecrireReglement(tx, acteur, centreId, {
        ...donnees,
        organisme,
        origineId: null,
        origine: 'MANUEL',
        identifiantExterne: null,
        motif: null,
      });
    },
    (id) =>
      evenementReglement('CREATE', id, centreId, {
        partAmoCentimes: donnees.partAmoCentimes,
        partAmcCentimes: donnees.partAmcCentimes,
      }),
  );
}

/** Contre-passe un virement saisi à tort : ligne inverse, jamais une suppression. Il doit être entièrement délettré. */
export async function annulerReglement(
  acteur: UtilisateurConnecte,
  reglementId: string,
  saisie: unknown,
): Promise<string> {
  const { motif } = valider(motifSaisieSchema, saisie);
  return withAudit(
    acteur,
    async (tx) => {
      const origine = await lireReglement(tx, acteur, reglementId);
      exigerRegularisation(acteur, origine.centreId);
      await verrou(tx, acteur, origine.centreId);
      const relu = await lireReglement(tx, acteur, reglementId);
      const inverses = await tx.reglementOrganisme.count({ where: { origineId: reglementId } });
      const total = relu.partAmoCentimes + relu.partAmcCentimes;
      if (relu.origineId !== null || inverses > 0) {
        throw new ErreurSaisie({}, 'Ce règlement est déjà annulé.');
      }
      if (relu.resteALettrerCentimes !== total) {
        throw new ErreurSaisie({}, 'Délettrez d’abord ce règlement.');
      }
      const id = await ecrireReglement(tx, acteur, relu.centreId, {
        origineId: reglementId,
        organisme: relu.organisme,
        complementaireId: relu.complementaireId,
        dateReglement: depuisDate(relu.dateReglement),
        reference: relu.reference,
        partAmoCentimes: -relu.partAmoCentimes,
        partAmcCentimes: -relu.partAmcCentimes,
        origine: relu.origine,
        identifiantExterne: null,
        motif,
      });
      await tx.reglementOrganisme.update({
        where: { id: reglementId },
        data: { resteALettrerCentimes: 0 },
      });
      return { id, centreId: relu.centreId };
    },
    ({ id, centreId }) => evenementReglement('CREATE', id, centreId, { origineId: reglementId }),
  ).then(({ id }) => id);
}

/** Reste du règlement par part, sous le verrou : lettrages nets et écarts en produit déduits. */
async function resteParType(
  tx: ClientTransaction,
  reglement: { id: string; partAmoCentimes: number; partAmcCentimes: number },
): Promise<ResteParType> {
  const [lettrages, ecarts] = await Promise.all([
    tx.lettrage.findMany({
      where: { reglementId: reglement.id },
      select: { type: true, montantCentimes: true },
    }),
    tx.regularisationCreance.findMany({
      where: { reglementId: reglement.id },
      select: { type: true, montantCentimes: true },
    }),
  ]);
  return resteDuReglement(reglement, [...lettrages, ...ecarts]);
}

async function exigerReglementOuvert(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  reglementId: string,
) {
  const lu = await lireReglement(tx, acteur, reglementId);
  exigerSuivi(acteur, lu.centreId);
  await verrou(tx, acteur, lu.centreId);
  const reglement = await lireReglement(tx, acteur, reglementId);
  const annule = await tx.reglementOrganisme.count({ where: { origineId: reglementId } });
  if (reglement.origineId !== null || annule > 0) {
    throw new ErreurSaisie({}, 'Ce règlement est annulé.');
  }
  return reglement;
}

/**
 * Lettre un règlement sur une ou plusieurs créances, en une fois. Sans effet comptable : le virement a déjà crédité
 * le compte de l'organisme. Voir `verifierLettrage`.
 */
export async function lettrer(
  acteur: UtilisateurConnecte,
  reglementId: string,
  saisie: unknown,
): Promise<void> {
  const { imputations } = valider(lettrageSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const reglement = await exigerReglementOuvert(tx, acteur, reglementId);
      const creances = await tx.creance.findMany({
        where: { id: { in: imputations.map((i) => i.creanceId) } },
      });
      const resultat = verifierLettrage(
        { centreId: reglement.centreId, reste: await resteParType(tx, reglement) },
        creances,
        imputations.map(({ creanceId, montant }) => ({ creanceId, montantCentimes: montant })),
      );
      if (!resultat.accepte) {
        throw new ErreurSaisie({}, MESSAGES_REFUS_LETTRAGE[resultat.code]);
      }
      let lettre = 0;
      for (const { creanceId, montantCentimes, type } of resultat.lignes) {
        await tx.lettrage.create({
          data: {
            organisationId: acteur.organisationId,
            centreId: reglement.centreId,
            reglementId,
            creanceId,
            type,
            montantCentimes,
            acteurId: acteur.id,
          },
        });
        await tx.creance.update({
          where: { id: creanceId },
          data: { soldeCentimes: { decrement: montantCentimes } },
        });
        lettre += montantCentimes;
      }
      await tx.reglementOrganisme.update({
        where: { id: reglementId },
        data: { resteALettrerCentimes: reglement.resteALettrerCentimes - lettre },
      });
      return { centreId: reglement.centreId, lettre };
    },
    ({ centreId, lettre }) =>
      evenementReglement('UPDATE', reglementId, centreId, { montantCentimes: lettre }),
  );
}

/** Défait un lettrage par une ligne inverse. */
export async function delettrer(acteur: UtilisateurConnecte, lettrageId: string): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const lettrage = await tx.lettrage.findFirst({
        where: { id: lettrageId, organisationId: acteur.organisationId },
      });
      if (!lettrage) {
        throw new AccesRefuseError();
      }
      exigerRegularisation(acteur, lettrage.centreId);
      await verrou(tx, acteur, lettrage.centreId);
      const inverses = await tx.lettrage.count({ where: { origineId: lettrageId } });
      if (lettrage.origineId !== null || inverses > 0) {
        throw new ErreurSaisie({}, 'Ce lettrage est déjà défait.');
      }
      const { reglementId, creanceId, centreId, type, montantCentimes } = lettrage;
      await tx.lettrage.create({
        data: {
          organisationId: acteur.organisationId,
          centreId,
          reglementId,
          creanceId,
          type,
          montantCentimes: -montantCentimes,
          origineId: lettrageId,
          acteurId: acteur.id,
        },
      });
      await tx.creance.update({
        where: { id: creanceId },
        data: { soldeCentimes: { increment: montantCentimes } },
      });
      await tx.reglementOrganisme.update({
        where: { id: reglementId },
        data: { resteALettrerCentimes: { increment: montantCentimes } },
      });
      return lettrage;
    },
    ({ reglementId, centreId, montantCentimes }) =>
      evenementReglement('UPDATE', reglementId, centreId, { montantCentimes: -montantCentimes }),
  );
}

/** Classe en produit ce qu'un organisme a versé en trop. Le reste ne se lettrera plus. */
export async function classerEcartReglement(
  acteur: UtilisateurConnecte,
  reglementId: string,
  saisie: unknown,
): Promise<void> {
  const { montant, motif, type } = valider(ecartReglementSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const reglement = await exigerReglementOuvert(tx, acteur, reglementId);
      exigerRegularisation(acteur, reglement.centreId);
      const reste = await resteParType(tx, reglement);
      if (montant > reste[type]) {
        throw new ErreurSaisie({}, MESSAGE_RESTE);
      }
      await ecrireRegularisation(tx, acteur, reglement.centreId, {
        origineId: null,
        creanceId: null,
        reglementId,
        type,
        nature: 'ECART_PROFIT',
        montantCentimes: montant,
        motif,
      });
      await tx.reglementOrganisme.update({
        where: { id: reglementId },
        data: { resteALettrerCentimes: reglement.resteALettrerCentimes - montant },
      });
      return reglement.centreId;
    },
    (centreId) => evenementReglement('UPDATE', reglementId, centreId, { montantCentimes: montant }),
  );
}

// --- Créances -------------------------------------------------------------------------------------

async function regulariser(
  acteur: UtilisateurConnecte,
  creanceId: string,
  saisie: unknown,
  nature: Extract<NatureRegularisation, 'ECART_PERTE' | 'TRANSFERT_PATIENT'>,
): Promise<void> {
  const { montant, motif } = valider(ecartSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const lue = await lireCreance(tx, acteur, creanceId);
      exigerRegularisation(acteur, lue.centreId);
      await verrou(tx, acteur, lue.centreId);
      const creance = await lireCreance(tx, acteur, creanceId);
      await regulariserCreance(tx, acteur, creance, nature, montant, motif);
      return creance;
    },
    (creance) => evenementCreance('UPDATE', creance, { nature, montantCentimes: montant }),
  );
}

/** Abandonne une part de créance : elle passe en perte, le patient n'en doit rien. */
export function enregistrerEcart(
  acteur: UtilisateurConnecte,
  creanceId: string,
  saisie: unknown,
): Promise<void> {
  return regulariser(acteur, creanceId, saisie, 'ECART_PERTE');
}

/**
 * Passe une part de créance à la charge du patient. La facture figée ne change pas : le solde du patient lit les
 * transferts.
 * À VÉRIFIER : faut-il une pièce rectificative (R44) ?
 */
export function transfererAuPatient(
  acteur: UtilisateurConnecte,
  creanceId: string,
  saisie: unknown,
): Promise<void> {
  return regulariser(acteur, creanceId, saisie, 'TRANSFERT_PATIENT');
}

/** Note un rejet de l'organisme. La créance reste due jusqu'à ce qu'on décide de sa suite. */
export async function enregistrerRejet(
  acteur: UtilisateurConnecte,
  creanceId: string,
  saisie: unknown,
): Promise<string> {
  const donnees = valider(rejetSaisieSchema, saisie);
  const { rejetId } = await withAudit(
    acteur,
    async (tx) => {
      const creance = await lireCreance(tx, acteur, creanceId);
      exigerSuivi(acteur, creance.centreId);
      if (creance.soldeCentimes <= 0) {
        throw new ErreurSaisie({}, MESSAGE_CREANCE_SOLDEE);
      }
      const { id } = await tx.rejetCreance.create({
        data: {
          organisationId: acteur.organisationId,
          centreId: creance.centreId,
          creanceId,
          dateRejet: versDate(donnees.dateRejet),
          code: donnees.code,
          motif: donnees.motif,
          saisiParId: acteur.id,
        },
        select: { id: true },
      });
      return { rejetId: id, creance };
    },
    ({ creance }) => evenementCreance('UPDATE', creance, { statut: 'REJETEE' }),
  );
  return rejetId;
}

/** Échéance après une représentation : le délai repart de ce jour. */
function nouvelleEcheance(
  creance: CreanceLue,
  delaiComplementaire: number | null,
  jour: string,
): string {
  return creance.type === 'AMO' || creance.numeroAccord === null
    ? echeanceAmo(jour)
    : echeanceAmc(jour, delaiComplementaire);
}

/** Décide de la suite d'un rejet : la créance repart, passe au patient ou s'abandonne. */
export async function resoudreRejet(
  acteur: UtilisateurConnecte,
  rejetId: string,
  saisie: unknown,
): Promise<void> {
  const { resolution, motif } = valider(resolutionRejetSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const rejet = await tx.rejetCreance.findFirst({
        where: { id: rejetId, organisationId: acteur.organisationId },
      });
      if (!rejet) {
        throw new AccesRefuseError();
      }
      if (resolution === 'REPRESENTEE') {
        exigerSuivi(acteur, rejet.centreId);
      } else {
        exigerRegularisation(acteur, rejet.centreId);
      }
      await verrou(tx, acteur, rejet.centreId);
      const relu = await tx.rejetCreance.findUniqueOrThrow({ where: { id: rejetId } });
      if (relu.resolution !== null) {
        throw new ErreurSaisie({}, 'Ce rejet est déjà traité.');
      }
      const creance = await lireCreance(tx, acteur, rejet.creanceId);
      await appliquerResolution(tx, acteur, creance, resolution, motif ?? rejet.motif);
      await tx.rejetCreance.update({
        where: { id: rejetId },
        data: { resolution, resoluLe: new Date(), resoluParId: acteur.id },
      });
      return creance;
    },
    (creance) => evenementCreance('UPDATE', creance, { resolution }),
  );
}

async function appliquerResolution(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  creance: CreanceLue,
  resolution: ResolutionRejet,
  motif: string,
): Promise<void> {
  if (resolution === 'REPRESENTEE') {
    const complementaire = creance.complementaireId
      ? await tx.complementaire.findUnique({
          where: { id: creance.complementaireId },
          select: { delaiPaiementJours: true },
        })
      : null;
    await tx.creance.update({
      where: { id: creance.id },
      data: {
        echeanceAttendue: versDate(
          nouvelleEcheance(creance, complementaire?.delaiPaiementJours ?? null, aujourdhui()),
        ),
      },
    });
    return;
  }
  if (creance.soldeCentimes <= 0) {
    throw new ErreurSaisie({}, MESSAGE_CREANCE_SOLDEE);
  }
  await regulariserCreance(
    tx,
    acteur,
    creance,
    resolution === 'ABANDONNEE' ? 'ECART_PERTE' : 'TRANSFERT_PATIENT',
    creance.soldeCentimes,
    motif,
  );
}

/** Note qu'une relance est partie. Le courrier lui-même arrive à l'étape 19. */
export async function marquerRelancee(
  acteur: UtilisateurConnecte,
  creanceId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const creance = await lireCreance(tx, acteur, creanceId);
      exigerSuivi(acteur, creance.centreId);
      await tx.creance.update({
        where: { id: creanceId },
        data: { derniereRelanceLe: versDate(aujourdhui()) },
      });
      return creance;
    },
    (creance) => evenementCreance('UPDATE', creance, { relance: true }),
  );
}

// --- Écrans ---------------------------------------------------------------------------------------

function clausePerimetre(acteur: UtilisateurConnecte, perimetre: Perimetre) {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  return {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
  };
}

const SANS_REJET = { rejets: { none: { resolution: null } } } as const;

function clauseStatut(
  client: Pick<ClientTransaction, 'creance'>,
  statut: StatutCreance | undefined,
): Prisma.CreanceWhereInput {
  const { montantCentimes } = client.creance.fields;
  switch (statut) {
    case 'OUVERTE':
      return { ...SANS_REJET, soldeCentimes: { equals: montantCentimes, gt: 0 } };
    case 'PARTIELLE':
      return { ...SANS_REJET, soldeCentimes: { lt: montantCentimes, gt: 0 } };
    case 'SOLDEE':
      return { ...SANS_REJET, soldeCentimes: 0 };
    case 'INDU':
      return { ...SANS_REJET, soldeCentimes: { lt: 0 } };
    case 'REJETEE':
      return { rejets: { some: { resolution: null } } };
    default:
      return { soldeCentimes: { not: 0 } };
  }
}

function clauseCreances(
  client: Pick<ClientTransaction, 'creance'>,
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  { organisme, type, statut, tranche }: Omit<FiltreCreances, 'page'>,
): Prisma.CreanceWhereInput {
  const bornes = tranche ? bornesTranche(tranche, aujourdhui()) : null;
  return {
    ...clausePerimetre(acteur, perimetre),
    ...clauseStatut(client, statut),
    ...(organisme ? { organisme } : {}),
    ...(type ? { type } : {}),
    ...(bornes
      ? {
          dateEmission: {
            ...(bornes.depuis ? { gte: versDate(bornes.depuis) } : {}),
            ...(bornes.jusqua ? { lte: versDate(bornes.jusqua) } : {}),
          },
        }
      : {}),
  };
}

const selectionCreance = {
  id: true,
  centreId: true,
  type: true,
  organisme: true,
  numeroAccord: true,
  montantCentimes: true,
  soldeCentimes: true,
  dateEmission: true,
  echeanceAttendue: true,
  derniereRelanceLe: true,
  centre: { select: { nom: true } },
  patient: { select: { id: true, nomNaissance: true, nomUsage: true, prenoms: true } },
  facture: { select: { id: true, numero: true, fse: { select: { statut: true } } } },
  rejets: { where: { resolution: null }, select: { id: true }, take: 1 },
} as const;

type CreanceBrute = Prisma.CreanceGetPayload<{ select: typeof selectionCreance }>;

export interface CreanceListee {
  id: string;
  centreId: string;
  centre: string;
  type: TypeCreance;
  organisme: string;
  numeroAccord: string | null;
  factureId: string;
  numeroFacture: string | null;
  patientId: string;
  patient: string;
  montant: Centimes;
  solde: Centimes;
  statut: StatutCreance;
  dateEmission: string;
  echeanceAttendue: string;
  derniereRelanceLe: string | null;
  tranche: TrancheAnciennete;
  fse: StatutFse | null;
}

function versCreanceListee(c: CreanceBrute, jour: string): CreanceListee {
  const dateEmission = depuisDate(c.dateEmission);
  return {
    id: c.id,
    centreId: c.centreId,
    centre: c.centre.nom,
    type: c.type,
    organisme: c.organisme,
    numeroAccord: c.numeroAccord,
    factureId: c.facture.id,
    numeroFacture: c.facture.numero,
    patientId: c.patient.id,
    patient: `${c.patient.nomUsage ?? c.patient.nomNaissance} ${c.patient.prenoms}`,
    montant: centimes(c.montantCentimes),
    solde: centimes(c.soldeCentimes),
    statut: statutCreance({ ...c, rejetATraiter: c.rejets.length > 0 }),
    dateEmission,
    echeanceAttendue: depuisDate(c.echeanceAttendue),
    derniereRelanceLe: c.derniereRelanceLe && depuisDate(c.derniereRelanceLe),
    tranche: trancheAnciennete(dateEmission, jour),
    fse: c.facture.fse?.statut ?? null,
  };
}

export interface ListeCreances {
  lignes: CreanceListee[];
  pagination: Pagination;
  filtre: FiltreCreances;
}

/** Une liste n'ouvre aucun dossier : pas de READ (ADR-006). Sans filtre : tout ce qui n'est pas soldé. */
export async function listerCreances(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeCreances> {
  const filtre = valider(filtreCreancesSchema, saisie);
  const client = base(acteur);
  const where = clauseCreances(client, acteur, perimetre, filtre);
  const total = await client.creance.count({ where });
  const pagination = calculerPagination(filtre.page, LIGNES_PAR_PAGE_TIERS_PAYANT, total);
  const lignes = await client.creance.findMany({
    where,
    orderBy: [{ dateEmission: 'asc' }, { id: 'asc' }],
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_TIERS_PAYANT,
    select: selectionCreance,
  });
  const jour = aujourdhui();
  return { lignes: lignes.map((l) => versCreanceListee(l, jour)), pagination, filtre };
}

/** Encours par organisme et par ancienneté. Seules les créances ouvertes pèsent. */
export async function syntheseParOrganisme(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<LigneSynthese[]> {
  const ouvertes = await base(acteur).creance.findMany({
    where: { ...clausePerimetre(acteur, perimetre), soldeCentimes: { gt: 0 } },
    select: { organisme: true, dateEmission: true, soldeCentimes: true },
  });
  return syntheseCreances(
    ouvertes.map((c) => ({ ...c, dateEmission: depuisDate(c.dateEmission) })),
    aujourdhui(),
  );
}

export interface ListeSimple<L> {
  lignes: L[];
  pagination: Pagination;
}

/** Créances échues et encore dues, la plus en retard d'abord ; un rejet se traite sur son propre écran. */
export async function listerImpayes(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeSimple<CreanceListee>> {
  const { page } = valider(filtreListeSchema, saisie);
  const jour = aujourdhui();
  const where: Prisma.CreanceWhereInput = {
    ...clausePerimetre(acteur, perimetre),
    ...SANS_REJET,
    soldeCentimes: { gt: 0 },
    echeanceAttendue: { lt: versDate(jour) },
  };
  const client = base(acteur);
  const pagination = calculerPagination(
    page,
    LIGNES_PAR_PAGE_TIERS_PAYANT,
    await client.creance.count({ where }),
  );
  const lignes = await client.creance.findMany({
    where,
    orderBy: [{ echeanceAttendue: 'asc' }, { id: 'asc' }],
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_TIERS_PAYANT,
    select: selectionCreance,
  });
  return { lignes: lignes.map((l) => versCreanceListee(l, jour)), pagination };
}

export interface RejetListe {
  id: string;
  creanceId: string;
  factureId: string;
  numeroFacture: string | null;
  patient: string;
  organisme: string;
  type: TypeCreance;
  solde: Centimes;
  dateRejet: string;
  code: string | null;
  motif: string;
}

export async function listerRejets(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeSimple<RejetListe>> {
  const { page } = valider(filtreListeSchema, saisie);
  const where: Prisma.RejetCreanceWhereInput = {
    ...clausePerimetre(acteur, perimetre),
    resolution: null,
  };
  const client = base(acteur);
  const pagination = calculerPagination(
    page,
    LIGNES_PAR_PAGE_TIERS_PAYANT,
    await client.rejetCreance.count({ where }),
  );
  const lignes = await client.rejetCreance.findMany({
    where,
    orderBy: [{ dateRejet: 'asc' }, { id: 'asc' }],
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_TIERS_PAYANT,
    include: {
      creance: {
        select: {
          organisme: true,
          type: true,
          soldeCentimes: true,
          facture: { select: { id: true, numero: true } },
          patient: { select: { nomNaissance: true, nomUsage: true, prenoms: true } },
        },
      },
    },
  });
  return {
    pagination,
    lignes: lignes.map(({ creance, ...rejet }) => ({
      id: rejet.id,
      creanceId: rejet.creanceId,
      factureId: creance.facture.id,
      numeroFacture: creance.facture.numero,
      patient: `${creance.patient.nomUsage ?? creance.patient.nomNaissance} ${creance.patient.prenoms}`,
      organisme: creance.organisme,
      type: creance.type,
      solde: centimes(creance.soldeCentimes),
      dateRejet: depuisDate(rejet.dateRejet),
      code: rejet.code,
      motif: rejet.motif,
    })),
  };
}

export interface ReglementListe {
  id: string;
  centre: string;
  organisme: string;
  dateReglement: string;
  reference: string;
  partAmo: Centimes;
  partAmc: Centimes;
  reste: Centimes;
  origine: OrigineReglement;
  annule: boolean;
}

export async function listerReglements(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeSimple<ReglementListe>> {
  const { page, aLettrer } = valider(filtreReglementsSchema, saisie);
  const where: Prisma.ReglementOrganismeWhereInput = {
    ...clausePerimetre(acteur, perimetre),
    origineId: null,
    ...(aLettrer ? { resteALettrerCentimes: { gt: 0 } } : {}),
  };
  const client = base(acteur);
  const pagination = calculerPagination(
    page,
    LIGNES_PAR_PAGE_TIERS_PAYANT,
    await client.reglementOrganisme.count({ where }),
  );
  const lignes = await client.reglementOrganisme.findMany({
    where,
    orderBy: [{ dateReglement: 'desc' }, { id: 'desc' }],
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE_TIERS_PAYANT,
    select: {
      id: true,
      organisme: true,
      dateReglement: true,
      reference: true,
      partAmoCentimes: true,
      partAmcCentimes: true,
      resteALettrerCentimes: true,
      origine: true,
      centre: { select: { nom: true } },
      inverses: { select: { id: true }, take: 1 },
    },
  });
  return {
    pagination,
    lignes: lignes.map((r) => ({
      id: r.id,
      centre: r.centre.nom,
      organisme: r.organisme,
      dateReglement: depuisDate(r.dateReglement),
      reference: r.reference,
      partAmo: centimes(r.partAmoCentimes),
      partAmc: centimes(r.partAmcCentimes),
      reste: centimes(r.resteALettrerCentimes),
      origine: r.origine,
      annule: r.inverses.length > 0,
    })),
  };
}

export interface LettrageVue {
  id: string;
  creanceId: string;
  numeroFacture: string | null;
  patient: string;
  type: TypeCreance;
  montant: Centimes;
  defait: boolean;
}

export interface ReglementDetail extends ReglementListe {
  centreId: string;
  motifAnnulation: string | null;
  resteParType: ResteParType;
  lettrages: LettrageVue[];
  /** Créances du centre encore à solder, celles de cet organisme d'abord. */
  candidates: CreanceListee[];
  regulariser: boolean;
}

/** Détail d'un règlement et créances lettrables. Les montants viennent des lignes, le patient n'est pas ouvert. */
export async function obtenirReglement(
  acteur: UtilisateurConnecte,
  reglementId: string,
): Promise<ReglementDetail> {
  const client = base(acteur);
  const r = await lireReglement(client as unknown as ClientTransaction, acteur, reglementId);
  exigerSuivi(acteur, r.centreId);
  const [centre, inverse, lettrages, ecarts, candidates] = await Promise.all([
    client.centre.findUniqueOrThrow({ where: { id: r.centreId }, select: { nom: true } }),
    client.reglementOrganisme.findFirst({
      where: { origineId: reglementId },
      select: { motif: true },
    }),
    client.lettrage.findMany({
      where: { reglementId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        creanceId: true,
        type: true,
        montantCentimes: true,
        origineId: true,
        creance: {
          select: {
            facture: { select: { numero: true } },
            patient: { select: { nomNaissance: true, nomUsage: true, prenoms: true } },
          },
        },
      },
    }),
    client.regularisationCreance.findMany({
      where: { reglementId },
      select: { type: true, montantCentimes: true },
    }),
    client.creance.findMany({
      where: { centreId: r.centreId, soldeCentimes: { gt: 0 } },
      orderBy: [{ dateEmission: 'asc' }, { id: 'asc' }],
      take: 200,
      select: selectionCreance,
    }),
  ]);
  const jour = aujourdhui();
  const defaits = new Set(lettrages.flatMap((l) => (l.origineId ? [l.origineId] : [])));
  const annule = inverse !== null;
  return {
    id: r.id,
    centreId: r.centreId,
    centre: centre.nom,
    organisme: r.organisme,
    dateReglement: depuisDate(r.dateReglement),
    reference: r.reference,
    partAmo: centimes(r.partAmoCentimes),
    partAmc: centimes(r.partAmcCentimes),
    reste: centimes(r.resteALettrerCentimes),
    origine: r.origine,
    annule,
    motifAnnulation: inverse?.motif ?? null,
    resteParType: annule
      ? { AMO: centimes(0), AMC: centimes(0) }
      : resteDuReglement(r, [...lettrages, ...ecarts]),
    lettrages: lettrages
      .filter((l) => l.origineId === null)
      .map((l) => ({
        id: l.id,
        creanceId: l.creanceId,
        numeroFacture: l.creance.facture.numero,
        patient: `${l.creance.patient.nomUsage ?? l.creance.patient.nomNaissance} ${l.creance.patient.prenoms}`,
        type: l.type,
        montant: centimes(l.montantCentimes),
        defait: defaits.has(l.id),
      })),
    candidates: candidates
      .map((c) => versCreanceListee(c, jour))
      .sort((a, b) => Number(b.organisme === r.organisme) - Number(a.organisme === r.organisme)),
    regulariser: peutRegulariserTiersPayant(acteur.role),
  };
}

export interface CreanceDeFacture {
  id: string;
  type: TypeCreance;
  organisme: string;
  montant: Centimes;
  solde: Centimes;
  statut: StatutCreance;
  echeanceAttendue: string;
}

/** Créances d'une pièce, affichées avec son détail, dont la lecture est déjà journalisée. */
export async function creancesDeLaFacture(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<CreanceDeFacture[]> {
  const lignes = await base(acteur).creance.findMany({
    where: { factureId, organisationId: acteur.organisationId },
    orderBy: { type: 'asc' },
    select: {
      id: true,
      type: true,
      organisme: true,
      montantCentimes: true,
      soldeCentimes: true,
      echeanceAttendue: true,
      rejets: { where: { resolution: null }, select: { id: true }, take: 1 },
    },
  });
  return lignes.map((c) => ({
    id: c.id,
    type: c.type,
    organisme: c.organisme,
    montant: centimes(c.montantCentimes),
    solde: centimes(c.soldeCentimes),
    statut: statutCreance({ ...c, rejetATraiter: c.rejets.length > 0 }),
    echeanceAttendue: depuisDate(c.echeanceAttendue),
  }));
}

const ENTETES_CSV = [
  'Centre',
  'Organisme',
  'Part',
  'Facture',
  'Date de facture',
  'Échéance attendue',
  'Montant',
  'Solde',
  'Statut',
  'Ancienneté',
  'Dernière relance',
];

/** Export CSV journalisé, produit par lots. Aucune identité de patient : la facture suffit à retrouver le dossier. */
export async function exporterCreances(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<AsyncGenerator<string>> {
  const filtre = valider(filtreCreancesSchema, saisie);
  const client = base(acteur);
  const where = clauseCreances(client, acteur, perimetre, filtre);
  const filtres = Object.fromEntries(Object.entries(filtre).filter(([cle]) => cle !== 'page'));
  await journaliser(client, auteurDepuisActeur(acteur), {
    action: 'EXPORT',
    entiteType: 'CREANCE',
    centreId: perimetre.type === 'centre' ? perimetre.centreId : null,
    details: { format: 'CSV', filtres },
  });
  const jour = aujourdhui();

  async function* lignes(): AsyncGenerator<string> {
    yield ligneCsv(ENTETES_CSV);
    let curseur: string | undefined;
    for (;;) {
      const lot = await client.creance.findMany({
        where,
        select: selectionCreance,
        orderBy: { id: 'asc' },
        take: LOT_EXPORT,
        ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
      });
      for (const brute of lot) {
        const c = versCreanceListee(brute, jour);
        yield ligneCsv([
          c.centre,
          c.organisme,
          c.type,
          c.numeroFacture ?? '',
          c.dateEmission,
          c.echeanceAttendue,
          formatEuros(c.montant),
          formatEuros(c.solde),
          LIBELLES_STATUTS_CREANCE[c.statut],
          LIBELLES_TRANCHES_ANCIENNETE[c.tranche],
          c.derniereRelanceLe ?? '',
        ]);
      }
      curseur = lot.at(-1)?.id;
      if (lot.length < LOT_EXPORT) {
        return;
      }
    }
  }
  return lignes();
}
