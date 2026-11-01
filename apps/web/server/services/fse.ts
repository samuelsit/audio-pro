import {
  centimes,
  construireFseDraft,
  fseAEnvoyer,
  fseDraftSchema,
  resultatFseSchema,
  type FseDraft,
  type ResultatFse,
  type StatutFse,
} from '@ha/domain';

import type { UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { billingEngine } from '../billing-engine';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie } from '../erreurs';
import { depuisDate } from './dossiers';
import { evenementPiece, lireFacture, type FactureLue } from './facturation';
import { aujourdhui } from './patients';
import { replanifierCreancesCaisse } from './tiers-payant';

const MESSAGE_FSE_IMPOSSIBLE = 'Cette facture ne donne pas lieu à une FSE.';

function evenementFse(facture: FactureLue, statut: StatutFse) {
  return { ...evenementPiece('SEND', facture), entiteType: 'FSE', details: { statut } } as const;
}

/** Prescription de la facture : celle rattachée à la vente directe, sinon la dernière du dossier. */
async function lirePrescription(tx: ClientTransaction, facture: FactureLue) {
  const selection = {
    datePrescription: true,
    prescripteur: { select: { nom: true, prenom: true, rpps: true } },
    dossier: {
      select: {
        praticien: {
          select: {
            rpps: true,
            adeli: true,
            utilisateur: { select: { nom: true, prenom: true } },
          },
        },
      },
    },
  } as const;
  const { dossierId, prescriptionId } = facture;
  return tx.prescription.findFirst({
    where: prescriptionId === null ? { dossierId: dossierId ?? '' } : { id: prescriptionId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: selection,
  });
}

/** Construit le brouillon depuis la pièce figée. Le NIR est lu ici, jamais journalisé. */
async function construireBrouillon(
  tx: ClientTransaction,
  facture: FactureLue,
): Promise<FseDraft | null> {
  const [piece, prescription, couverture, patient, centre] = await Promise.all([
    tx.facture.findUniqueOrThrow({
      where: { id: facture.id },
      include: { lignes: { orderBy: { rang: 'asc' } } },
    }),
    lirePrescription(tx, facture),
    tx.couvertureAmo.findUnique({ where: { patientId: facture.patientId } }),
    tx.patient.findUniqueOrThrow({
      where: { id: facture.patientId },
      select: { nomNaissance: true, nomUsage: true, prenoms: true, dateNaissance: true },
    }),
    tx.centre.findUniqueOrThrow({
      where: { id: facture.centreId },
      select: { numeroFacturationAm: true },
    }),
  ]);
  if (!prescription || !couverture || piece.numero === null || piece.dateFacture === null) {
    return null;
  }
  const { praticien } = prescription.dossier;
  return construireFseDraft({
    tiersPayantAmo: piece.tiersPayantAmo,
    factureId: piece.id,
    numeroFacture: piece.numero,
    dateFacture: depuisDate(piece.dateFacture),
    beneficiaire: {
      nir: couverture.nir,
      rangNaissance: couverture.rangNaissance,
      qualite: couverture.qualite,
      nom: patient.nomUsage ?? patient.nomNaissance,
      prenoms: patient.prenoms,
      dateNaissance: depuisDate(patient.dateNaissance),
      regime: couverture.regime,
      caisse: couverture.caisse,
      centreGestionnaire: couverture.centreGestionnaire,
    },
    praticien: {
      nom: praticien.utilisateur.nom,
      prenom: praticien.utilisateur.prenom,
      rpps: praticien.rpps,
      adeli: praticien.adeli,
      numeroFacturationAm: centre.numeroFacturationAm,
    },
    prescripteur: {
      nom: prescription.prescripteur.nom,
      prenom: prescription.prescripteur.prenom,
      rpps: prescription.prescripteur.rpps,
      datePrescription: depuisDate(prescription.datePrescription),
    },
    lignes: piece.lignes.map((l) => ({
      codeLpp: l.codeLpp,
      codePrestation: l.codePrestation,
      oreille: l.oreille,
      numeroSerie: l.numeroSerie,
      quantite: l.quantite,
      prixTTC: centimes(l.prixTtcCentimes),
      baseRemboursement: centimes(l.baseRemboursementCentimes),
      amo: centimes(l.amoCentimes),
      amc: centimes(l.amcCentimes),
      resteACharge: centimes(l.resteAChargeCentimes),
    })),
  });
}

async function enregistrerResultat(
  acteur: UtilisateurConnecte,
  facture: FactureLue,
  resultat: ResultatFse,
): Promise<StatutFse> {
  const { reference, statut, motif } = resultatFseSchema.parse(resultat);
  await withAudit(
    acteur,
    async (tx) => {
      await tx.fse.update({ where: { factureId: facture.id }, data: { reference, statut, motif } });
      if (statut === 'ACCEPTEE') {
        await replanifierCreancesCaisse(tx, facture.id, aujourdhui());
      }
    },
    () => evenementFse(facture, statut),
  );
  return statut;
}

/**
 * Prépare la FSE d'une facture validée et la dépose au moteur de facturation, hors transaction. Le dépôt est
 * idempotent : une FSE en cours ne repart pas ; une FSE rejetée, ou dont le dépôt n'a pas abouti, repart.
 * À VÉRIFIER : champs et statuts provisoires, alignés sur AreaFSE à l'étape 26.
 */
export async function preparerFse(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<StatutFse> {
  const facture = await lireFacture(base(acteur), acteur, factureId);
  if (facture.nature !== 'FACTURE' || facture.statut !== 'VALIDEE') {
    throw new ErreurSaisie({}, MESSAGE_FSE_IMPOSSIBLE);
  }
  const draft = await withAudit(
    acteur,
    async (tx) => {
      const existante = await tx.fse.findUnique({
        where: { factureId },
        select: { statut: true, reference: true },
      });
      const aReprendre = existante !== null && existante.reference === null;
      if (!aReprendre && !fseAEnvoyer(existante?.statut ?? null)) {
        throw new ErreurSaisie({}, 'Une FSE est déjà en cours pour cette facture.');
      }
      const brouillon = await construireBrouillon(tx, facture);
      if (brouillon === null) {
        throw new ErreurSaisie({}, MESSAGE_FSE_IMPOSSIBLE);
      }
      const valide = fseDraftSchema.parse(brouillon);
      const contenu = JSON.stringify(valide);
      await tx.fse.upsert({
        where: { factureId },
        create: { factureId, contenu, soumiseParId: acteur.id },
        update: {
          contenu,
          statut: 'EN_ATTENTE',
          motif: null,
          reference: null,
          soumiseParId: acteur.id,
        },
      });
      return valide;
    },
    () => evenementFse(facture, 'EN_ATTENTE'),
  );
  return enregistrerResultat(acteur, facture, await billingEngine().soumettre(draft));
}

/** Relit le statut au moteur de facturation. */
export async function actualiserStatutFse(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<StatutFse> {
  const client = base(acteur);
  const facture = await lireFacture(client, acteur, factureId);
  const fse = await client.fse.findUnique({ where: { factureId }, select: { reference: true } });
  if (!fse?.reference) {
    throw new ErreurSaisie({}, 'Aucune FSE déposée pour cette facture.');
  }
  return enregistrerResultat(acteur, facture, await billingEngine().consulter(fse.reference));
}
