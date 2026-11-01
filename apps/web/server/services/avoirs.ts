import {
  avoirAvecFseEnCours,
  avoirSaisieSchema,
  calculerAvoir,
  centimes,
  MESSAGES_REFUS_AVOIR,
  MONTANTS_NULS,
  peutEmettreAvoir,
  reprisesTotales,
  totauxAvoir,
  type LigneAAvoir,
  type MontantsLigne,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import type { ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { ajouterMaillon, chargeDepuisBase } from './chaine-caisse';
import { appliquerTransition, evenementTransition, lireDossier, versDate } from './dossiers';
import {
  attribuerNumero,
  deposerOriginal,
  evenementPiece,
  lireFacture,
  type FactureLue,
} from './facturation';
import { creerBrouillonDossier } from './factures';
import { aujourdhui } from './patients';
import { appliquerMouvement, evenementMouvement, lireAppareil } from './stock';

type LigneEnBase = Awaited<ReturnType<typeof lirePiece>>['lignes'][number];

function lirePiece(tx: ClientTransaction, factureId: string) {
  return tx.facture.findUniqueOrThrow({
    where: { id: factureId },
    include: { lignes: { orderBy: { rang: 'asc' } } },
  });
}

function montants(ligne: LigneEnBase): MontantsLigne {
  return {
    prixTTC: centimes(ligne.prixTtcCentimes),
    montantHT: centimes(ligne.montantHtCentimes),
    montantTva: centimes(ligne.montantTvaCentimes),
    baseRemboursement: centimes(ligne.baseRemboursementCentimes),
    amo: centimes(ligne.amoCentimes),
    amc: centimes(ligne.amcCentimes),
    resteACharge: centimes(ligne.resteAChargeCentimes),
  };
}

/** Lignes de la facture, avec le cumul de ses avoirs validés. À lire sous le verrou de la série. */
async function lignesAAvoir(
  tx: ClientTransaction,
  lignes: readonly LigneEnBase[],
): Promise<LigneAAvoir[]> {
  const reprises = await tx.ligneFacture.findMany({
    where: {
      ligneOrigineId: { in: lignes.map((l) => l.id) },
      facture: { statut: 'VALIDEE' },
    },
  });
  return lignes.map((ligne) => {
    const dejaAvoir = reprises
      .filter((r) => r.ligneOrigineId === ligne.id)
      .reduce<MontantsLigne>((cumul, reprise) => {
        const part = montants(reprise);
        return {
          prixTTC: centimes(cumul.prixTTC + part.prixTTC),
          montantHT: centimes(cumul.montantHT + part.montantHT),
          montantTva: centimes(cumul.montantTva + part.montantTva),
          baseRemboursement: centimes(cumul.baseRemboursement + part.baseRemboursement),
          amo: centimes(cumul.amo + part.amo),
          amc: centimes(cumul.amc + part.amc),
          resteACharge: centimes(cumul.resteACharge + part.resteACharge),
        };
      }, MONTANTS_NULS);
    return {
      id: ligne.id,
      nature: ligne.nature,
      oreille: ligne.oreille,
      classe: ligne.classe,
      libelle: ligne.libelle,
      quantite: ligne.quantite,
      codeLpp: ligne.codeLpp,
      codeLppGenerique: ligne.codeLppGenerique,
      codePrestation: ligne.codePrestation as LigneAAvoir['codePrestation'],
      numeroSerie: ligne.numeroSerie,
      prixUnitaire: centimes(ligne.prixUnitaireCentimes),
      tauxTva: ligne.tauxTva ?? 0,
      ...montants(ligne),
      dejaAvoir,
    };
  });
}

/**
 * Un avoir qui solde la facture d'un dossier annule la vente : la délivrance reste, marquée annulée et hors du
 * délai de 4 ans ; les appareils redeviennent réservés avec leur lien d'essai ; le dossier revient à facturer
 * sur un nouveau brouillon. Les piles et accessoires ne rentrent pas en stock (à arbitrer, ADR-028).
 */
async function annulerVente(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  facture: FactureLue,
  avoirId: string,
  lignes: readonly LigneEnBase[],
): Promise<EvenementAudit[]> {
  const { dossierId } = facture;
  if (dossierId === null) {
    return [];
  }
  const dossier = await lireDossier(tx, acteur, dossierId);
  if (dossier.statut !== 'FACTURE') {
    throw new ErreurSaisie({}, 'Ce dossier est clos : sa vente ne s’annule plus.');
  }
  await tx.delivrance.updateMany({
    where: { factureId: facture.id, annuleeLe: null },
    data: { annuleeLe: new Date(), avoirId },
  });
  const evenements: EvenementAudit[] = [];
  for (const { appareilId } of lignes) {
    if (appareilId === null) {
      continue;
    }
    const appareil = await lireAppareil(tx, acteur, appareilId);
    const mouvement = {
      type: 'CHANGEMENT_STATUT',
      statut: 'RESERVE',
      centreId: appareil.centreId,
      patientId: dossier.patientId,
      motif: 'Vente annulée par un avoir total',
      dossierId,
    } as const;
    await appliquerMouvement(tx, acteur, appareil, mouvement);
    evenements.push(evenementMouvement(appareil, mouvement, appareil.centreId));
    // Le dernier lien de l'appareil est celui que la vente a fermé : un retrait plus ancien reste.
    const lien = await tx.essaiAppareil.findFirstOrThrow({
      where: { appareilId, essai: { dossierId } },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    await tx.essaiAppareil.update({
      where: { id: lien.id },
      data: { retireLe: null, retireParId: null },
    });
  }
  await appliquerTransition(tx, acteur, dossier, 'A_FACTURER', 'Avoir total');
  evenements.push(evenementTransition(dossier, 'A_FACTURER'));
  evenements.push(await creerBrouillonDossier(tx, acteur, dossier));
  return evenements;
}

export interface AvoirEmis {
  avoirId: string;
  /** La FSE de la facture est partie : sa correction arrive à l'étape 26 (ADR-028). */
  alerteFse: boolean;
}

/**
 * Émet un avoir, total ou partiel, en une action : il prend le prochain numéro de la série et se fige aussitôt.
 * Le cumul se lit sous le verrou de la série, pour que deux avoirs simultanés ne dépassent pas la facture.
 * À VÉRIFIER : la reprise au prorata d'un avoir partiel est un choix applicatif (R29).
 */
export async function emettreAvoir(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<AvoirEmis> {
  if (!peutEmettreAvoir(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { mode, motif, reprises } = valider(avoirSaisieSchema, saisie);
  const { avoirId, alerteFse } = await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      if (facture.nature !== 'FACTURE' || facture.statut !== 'VALIDEE') {
        throw new ErreurSaisie({}, 'Un avoir se fait sur une facture validée.');
      }
      const { numero, numeroSequence } = await attribuerNumero(tx, acteur, facture.centreId);
      const piece = await lirePiece(tx, factureId);
      const aAvoir = await lignesAAvoir(tx, piece.lignes);
      const demandees = mode === 'TOTAL' ? reprisesTotales(aAvoir) : reprises;
      const resultat = calculerAvoir(aAvoir, demandees);
      if (!resultat.accepte) {
        throw new ErreurSaisie({}, MESSAGES_REFUS_AVOIR[resultat.code]);
      }
      const totaux = totauxAvoir(resultat.lignes);
      const jour = aujourdhui();
      const { id } = await tx.facture.create({
        data: {
          organisationId: acteur.organisationId,
          centreId: facture.centreId,
          patientId: facture.patientId,
          dossierId: facture.dossierId,
          nature: 'AVOIR',
          factureOrigineId: factureId,
          motif,
          createdById: acteur.id,
        },
        select: { id: true },
      });
      const lignes = resultat.lignes.map((l, index) => ({
        factureId: id,
        rang: index + 1,
        nature: l.nature,
        oreille: l.oreille,
        classe: l.classe,
        libelle: l.libelle,
        codeLpp: l.codeLpp,
        codeLppGenerique: l.codeLppGenerique,
        codePrestation: l.codePrestation,
        numeroSerie: l.numeroSerie,
        quantite: l.quantite,
        prixUnitaireCentimes: l.prixUnitaire,
        prixTtcCentimes: l.prixTTC,
        tauxTva: l.tauxTva,
        montantHtCentimes: l.montantHT,
        montantTvaCentimes: l.montantTva,
        baseRemboursementCentimes: l.baseRemboursement,
        amoCentimes: l.amo,
        amcCentimes: l.amc,
        resteAChargeCentimes: l.resteACharge,
        ligneOrigineId: l.ligneOrigineId,
      }));
      await tx.ligneFacture.createMany({ data: lignes });
      const enBase = {
        totalTtcCentimes: totaux.prixTTC,
        totalHtCentimes: totaux.ht,
        totalTvaCentimes: totaux.tva,
        totalAmoCentimes: totaux.amo,
        totalAmcCentimes: totaux.amc,
        totalResteCentimes: totaux.resteACharge,
      };
      const charge = chargeDepuisBase(
        {
          id,
          nature: 'AVOIR',
          numero,
          numeroSequence,
          dateFacture: jour,
          patientId: facture.patientId,
          dossierId: facture.dossierId,
          factureOrigineId: factureId,
          ...enBase,
        },
        lignes,
      );
      const { empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
        centreId: facture.centreId,
        type: 'AVOIR_VALIDE',
        factureId: id,
        charge,
      });
      await tx.facture.update({
        where: { id },
        data: {
          ...enBase,
          statut: 'VALIDEE',
          numero,
          numeroSequence,
          dateFacture: versDate(jour),
          vendeur: piece.vendeur ?? {},
          client: piece.client ?? {},
          valideeLe: horodatage,
          valideeParId: acteur.id,
          empreinte,
        },
      });
      const fse = await tx.fse.findUnique({ where: { factureId }, select: { statut: true } });
      const effets = resultat.solde
        ? await annulerVente(tx, acteur, facture, id, piece.lignes)
        : [];
      return {
        avoirId: id,
        alerteFse: avoirAvecFseEnCours(fse?.statut ?? null),
        evenements: [
          evenementPiece('CREATE', { ...facture, id }, { numero, nature: 'AVOIR', factureId }),
          ...effets,
        ],
      };
    },
    (r) => r.evenements,
  );
  await deposerOriginal(acteur, { id: avoirId }).catch(() => undefined);
  return { avoirId, alerteFse };
}
