import type { OreilleDossier } from '../audio-rules/controle-prescription';
import { sansDoublons, type CodeControle, type Constat } from '../audio-rules/controles';
import { couvertureAmoAJour } from '../audio-rules/couverture-amo';
import { prescriptionValide, type PrescripteurAControler } from '../audio-rules/prescription';
import { eligibiliteRenouvellement, type Delivrance } from '../audio-rules/renouvellement';
import { plafondPrixVente, type TarifsAudio } from '../audio-rules/tarifs';
import type { Oreille } from '../audio-rules/code-prestation';
import type { Centimes } from '../money';
import { ageAt } from '../patient/age';
import { pecAccordee, pecExpiree } from '../tiers-payant/pec';
import type { OrigineDonnee } from '../patient/patient';
import { etatDroitsAmo } from '../vitale/droits';
import { controlerMentions, type ClientFacture, type VendeurFacture } from './mentions';
import type { ContenuFacture, LigneFacture } from './preparation';
import type { EtatFacture, StatutPec } from './saisie';
import type { NatureLigneFacture } from './types';

export interface CouvertureAmoAControler {
  readonly origine: OrigineDonnee;
  readonly derniereLectureVitale: string | null;
  readonly modifieeLe: string;
  readonly finDroits: string | null;
}

export interface PrescriptionFacture {
  readonly datePrescription: string;
  readonly oreilles: readonly Oreille[];
  readonly prescripteur: PrescripteurAControler & { readonly rpps: string | null };
  /** Erreurs forcées par un ADMIN_CLIENT à l'enregistrement : elles ne bloquent plus. */
  readonly erreursForcees: readonly Constat[];
}

export interface DevisFacture {
  readonly dateEmission: string;
  readonly refusOffreC2S: boolean;
  readonly contratResponsable: boolean;
  /** Part AMO de l'offre retenue, telle que signée. */
  readonly amoPrevue: Centimes | null;
  /** Le devis annonce une part AMC. */
  readonly amcPrevue: boolean;
  /** Taux de TVA de l'offre retenue, par nature de ligne. */
  readonly tauxTva: readonly { readonly nature: NatureLigneFacture; readonly taux: number }[];
}

export interface FaitsFacture {
  readonly dateNaissance: string;
  readonly c2s: boolean;
  readonly surdicecite: boolean;
  readonly oreilles: readonly OreilleDossier[];
  readonly couvertureAmo: CouvertureAmoAControler | null;
  readonly amoConfirmeeLe: string | null;
  /** Le patient a une couverture complémentaire. */
  readonly couvertureAmc: boolean;
  readonly prescription: PrescriptionFacture | null;
  readonly historiqueDelivrances: readonly Delivrance[];
  /** Devis signé avec une offre retenue, `null` sinon. */
  readonly devis: DevisFacture | null;
  readonly pec: {
    readonly statut: StatutPec;
    readonly justificatif: boolean;
    readonly validiteFin: string | null;
  } | null;
  /** Le tiers payant AMO est demandé sur cette facture. */
  readonly tiersPayantAmo: boolean;
  readonly tarifs: TarifsAudio;
  readonly vendeur: VendeurFacture;
  readonly client: ClientFacture;
}

/** Une vente directe n'a ni devis ni dossier ; la couverture n'importe qu'avec une prescription. */
export interface FaitsVenteDirecte {
  readonly remboursable: boolean;
  readonly c2s: boolean;
  readonly tiersPayantAmo: boolean;
  readonly couvertureAmo: CouvertureAmoAControler | null;
  readonly amoConfirmeeLe: string | null;
  readonly vendeur: VendeurFacture;
  readonly client: ClientFacture;
}

export interface ResultatControleFacture {
  readonly erreurs: readonly Constat[];
  readonly avertissements: readonly Constat[];
}

/** Constats en cours de collecte, pour chaque famille de contrôles. */
interface Collecte {
  readonly erreurs: Constat[];
  readonly avertissements: Constat[];
}

/**
 * Couverture à jour et droits ouverts à la date de délivrance.
 * Source : convention-audioprothesistes.pdf, art. 27, p. 26. Voir `couvertureAmoAJour`.
 */
function controlerCouverture(
  { dateDelivrance }: ContenuFacture,
  { couvertureAmo, amoConfirmeeLe }: Pick<FaitsFacture, 'couvertureAmo' | 'amoConfirmeeLe'>,
  { erreurs, avertissements }: Collecte,
): void {
  if (couvertureAmo === null) {
    erreurs.push({ code: 'COUVERTURE_AMO_ABSENTE', oreille: null });
    return;
  }
  if (!couvertureAmoAJour({ ...couvertureAmo, dateDelivrance, confirmeeLe: amoConfirmeeLe })) {
    erreurs.push({ code: 'COUVERTURE_AMO_A_CONFIRMER', oreille: null });
  }
  const droits = { debut: null, fin: couvertureAmo.finDroits };
  const etat = etatDroitsAmo(droits, dateDelivrance);
  if (etat === 'INCONNUS') {
    avertissements.push({ code: 'DROITS_AMO_FIN_INCONNUE', oreille: null });
  } else if (etat !== 'OUVERTS') {
    erreurs.push({ code: 'DROITS_AMO_NON_OUVERTS', oreille: null });
  }
}

/**
 * Prescription jointe à la facturation, et délai de renouvellement à la délivrance réelle : une délivrance
 * reprise après l'enregistrement de la prescription compte (ADR-011). Une erreur forcée par un ADMIN_CLIENT reste
 * visible, en avertissement.
 * Source : convention-audioprothesistes.pdf, art. 22 § 1, p. 22 et art. 28, p. 26 ;
 * modele-devis-audio.pdf p. 1.
 * À VÉRIFIER : durée de validité de l'ordonnance absente de docs/ref, non contrôlée (R11).
 */
function controlerPrescription(
  { dateDelivrance }: ContenuFacture,
  { dateNaissance, oreilles, prescription, historiqueDelivrances, devis }: FaitsFacture,
  { erreurs, avertissements }: Collecte,
): void {
  if (prescription === null) {
    erreurs.push({ code: 'PRESCRIPTION_ABSENTE', oreille: null });
    return;
  }
  const { datePrescription, prescripteur, erreursForcees } = prescription;
  const signaler = (code: CodeControle, oreille: Oreille | null) => {
    const forcee = erreursForcees.some((c) => c.code === code && c.oreille === oreille);
    (forcee ? avertissements : erreurs).push({ code, oreille });
  };
  if (prescripteur.rpps === null) {
    avertissements.push({ code: 'RPPS_PRESCRIPTEUR_MANQUANT', oreille: null });
  }
  const age = ageAt(dateNaissance, dateDelivrance);
  for (const { oreille, type } of oreilles) {
    if (!prescription.oreilles.includes(oreille)) {
      signaler('OREILLE_NON_PRESCRITE', oreille);
    }
    const date = dateDelivrance;
    if (!eligibiliteRenouvellement({ historiqueDelivrances, oreille, date }).eligible) {
      signaler('RENOUVELLEMENT_AVANT_DELAI', oreille);
    }
    const resultat = prescriptionValide({
      prescripteur,
      age,
      type,
      datePrescription,
      dateDevis: devis?.dateEmission ?? datePrescription,
    });
    resultat.erreurs.forEach((code) => {
      signaler(code, null);
    });
    avertissements.push(...resultat.avertissements.map((code) => ({ code, oreille })));
  }
}

/** Une ligne de facture a toujours un taux en vigueur à sa date (R18). */
function controlerTva({ lignes }: ContenuFacture, { erreurs }: Collecte): void {
  for (const { tauxTva, oreille } of lignes) {
    if (tauxTva === null) {
      erreurs.push({ code: 'TAUX_TVA_ABSENT', oreille });
    }
  }
}

/** Le devis signé fige son taux : un écart se signale, la facture suit le taux en vigueur (R18). */
function controlerTvaDevis(
  { lignes }: ContenuFacture,
  { devis }: FaitsFacture,
  { avertissements }: Collecte,
): void {
  for (const { nature, tauxTva, oreille } of lignes) {
    const prevu = devis?.tauxTva.find((t) => t.nature === nature);
    if (prevu !== undefined && tauxTva !== null && prevu.taux !== tauxTva) {
      avertissements.push({ code: 'TVA_DIFFERENTE_DEVIS', oreille });
    }
  }
}

function collecterMentions(
  { lignes }: ContenuFacture,
  { vendeur, client }: Pick<FaitsFacture, 'vendeur' | 'client'>,
  collecte: Collecte,
): void {
  const { erreurs, avertissements } = controlerMentions(vendeur, client, lignes);
  collecte.erreurs.push(...erreurs);
  collecte.avertissements.push(...avertissements);
}

/** Filet de sécurité : `ventilation` garantit déjà la somme, le contrôle couvre tout autre chemin. */
function ligneCoherente({ prixTTC, amo, amc, resteACharge }: LigneFacture): boolean {
  return amo >= 0 && amc >= 0 && resteACharge >= 0 && amo + amc + resteACharge === prixTTC;
}

/**
 * Prix, numéro de série et ventilation de chaque ligne.
 * Source : convention-audioprothesistes.pdf, art. 21, p. 21 (numéro de série), art. 25, p. 24 et art. 29,
 * p. 27 (plafonds, à la délivrance : un patient peut atteindre 20 ans pendant l'essai) ;
 * ameli-100-sante-audio.pdf p. 1 (classe I sans reste à charge, contrat responsable).
 */
function controlerLignes(
  { lignes, totaux, dateDelivrance }: ContenuFacture,
  { dateNaissance, c2s, surdicecite, devis, pec, tarifs }: FaitsFacture,
  { erreurs, avertissements }: Collecte,
): void {
  const age = ageAt(dateNaissance, dateDelivrance);
  const refusOffreC2S = devis?.refusOffreC2S ?? false;
  for (const ligne of lignes) {
    const { classe, oreille } = ligne;
    if (!ligneCoherente(ligne)) {
      erreurs.push({ code: 'VENTILATION_INCOHERENTE', oreille });
    }
    if (ligne.codeLppGenerique) {
      avertissements.push({ code: 'CODE_LPP_GENERIQUE', oreille });
    }
    if (classe === null) {
      if (ligne.baseRemboursement === 0) {
        avertissements.push({ code: 'ARTICLE_SANS_CODE_LPP', oreille });
      }
      continue;
    }
    if (ligne.numeroSerie === null) {
      erreurs.push({ code: 'NUMERO_SERIE_MANQUANT', oreille });
    }
    const plafond = plafondPrixVente({ classe, age, c2s, refusOffreC2S, surdicecite }, tarifs);
    if (plafond !== null && ligne.prixTTC > plafond) {
      const code =
        c2s && !refusOffreC2S ? 'PRIX_SUPERIEUR_PLAFOND_C2S' : 'PRIX_SUPERIEUR_PRIX_LIMITE';
      erreurs.push({ code, oreille });
    }
    const accordee = !c2s && pec !== null && pecAccordee(pec.statut);
    if (
      accordee &&
      devis?.contratResponsable === true &&
      classe === 'CLASSE_I' &&
      ligne.resteACharge > 0
    ) {
      avertissements.push({ code: 'RESTE_A_CHARGE_CLASSE_I', oreille });
    }
  }
  if (totaux.amo + totaux.amc + totaux.resteACharge !== totaux.prixTTC) {
    erreurs.push({ code: 'VENTILATION_INCOHERENTE', oreille: null });
  }
  if (devis && devis.amoPrevue !== null && devis.amoPrevue !== totaux.amo) {
    avertissements.push({ code: 'ECART_AMO_DEVIS', oreille: null });
  }
}

/**
 * Prise en charge complémentaire, renseignée si un tiers payant AMC est attendu. La C2S n'en a pas besoin :
 * sa part se calcule (`partAMCC2S`). `SANS_TIERS_PAYANT` lève l'attente.
 * À VÉRIFIER : choix applicatif, la procédure de PEC n'est pas dans docs/ref (R23).
 */
function controlerPec(
  { amcNonAffectee, dateDelivrance }: ContenuFacture,
  { c2s, couvertureAmc, devis, pec }: FaitsFacture,
  { erreurs, avertissements }: Collecte,
): void {
  if (c2s) {
    return;
  }
  const constat = (code: CodeControle): Constat => ({ code, oreille: null });
  if (pec === null) {
    if (couvertureAmc || devis?.amcPrevue === true) {
      erreurs.push(constat('PEC_MANQUANTE'));
    }
    return;
  }
  if (pecExpiree(pec, dateDelivrance)) {
    erreurs.push(constat('PEC_EXPIREE'));
  } else if (pec.statut === 'A_DEMANDER' || pec.statut === 'DEMANDEE') {
    erreurs.push(constat('PEC_EN_ATTENTE'));
  } else if (pec.statut === 'REFUSEE') {
    avertissements.push(constat('PEC_REFUSEE'));
  } else if (pecAccordee(pec.statut)) {
    if (!pec.justificatif) {
      avertissements.push(constat('PEC_SANS_JUSTIFICATIF'));
    }
    if (amcNonAffectee > 0) {
      avertissements.push(constat('PEC_SUPERIEURE_AU_RESTE'));
    }
  }
}

/**
 * La C2S impose le tiers payant.
 * Source : convention-audioprothesistes.pdf, art. 1, p. 6 et art. 27, p. 26.
 * À VÉRIFIER : AME, ALD, maternité, risques professionnels et détention sont aussi visés par l'article, mais
 * aucune de ces situations n'est connue de façon fiable à la facturation (R43).
 */
function controlerTiersPayant(
  { c2s, tiersPayantAmo }: Pick<FaitsFacture, 'c2s' | 'tiersPayantAmo'>,
  { erreurs }: Collecte,
): void {
  if (c2s && !tiersPayantAmo) {
    erreurs.push({ code: 'TIERS_PAYANT_OBLIGATOIRE', oreille: null });
  }
}

/**
 * Contrôles avant « prêt à facturer ». Les erreurs bloquent, les avertissements n'empêchent rien. L'état se
 * recalcule à chaque lecture, et la validation relance ces contrôles dans sa transaction (ADR-028).
 * Sources : voir chaque famille de contrôles.
 */
export function controlerFacture(
  facture: ContenuFacture,
  faits: FaitsFacture,
): ResultatControleFacture {
  const collecte: Collecte = { erreurs: [], avertissements: [] };
  if (faits.devis === null) {
    collecte.erreurs.push({ code: 'DEVIS_NON_SIGNE', oreille: null });
  }
  controlerCouverture(facture, faits, collecte);
  controlerTiersPayant(faits, collecte);
  controlerPrescription(facture, faits, collecte);
  controlerLignes(facture, faits, collecte);
  controlerPec(facture, faits, collecte);
  controlerTva(facture, collecte);
  controlerTvaDevis(facture, faits, collecte);
  collecterMentions(facture, faits, collecte);
  return {
    erreurs: sansDoublons(collecte.erreurs),
    avertissements: sansDoublons(collecte.avertissements),
  };
}

/**
 * Contrôles d'une vente directe. La prescription, facultative, n'ouvre que le remboursement : elle doit
 * alors s'accompagner d'une couverture à jour.
 * Source : fr201-codes-prestation.pdf, table 4 p. 4 (prescription requise pour PIL et APA) ;
 * convention-audioprothesistes.pdf, art. 27, p. 26.
 */
export function controlerVenteDirecte(
  contenu: ContenuFacture,
  faits: FaitsVenteDirecte,
): ResultatControleFacture {
  const collecte: Collecte = { erreurs: [], avertissements: [] };
  if (faits.remboursable) {
    controlerCouverture(contenu, faits, collecte);
  }
  controlerTiersPayant(faits, collecte);
  controlerTva(contenu, collecte);
  collecterMentions(contenu, faits, collecte);
  return {
    erreurs: sansDoublons(collecte.erreurs),
    avertissements: sansDoublons(collecte.avertissements),
  };
}

export function etatFacture({ erreurs }: ResultatControleFacture): EtatFacture {
  return erreurs.length === 0 ? 'PRET' : 'BLOQUE';
}
