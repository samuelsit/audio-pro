import type { ClasseLpp } from '../catalogue';
import { ajouterMois } from '../commun/date';
import type { Centimes } from '../money';
import { ageAt } from '../patient/age';
import type { Oreille } from './code-prestation';
import { PLAFOND_CONTRAT_RESPONSABLE, VALIDITE_MINIMALE_DEVIS_MOIS } from './constantes';
import type { CodeControle, Constat } from './controles';
import {
  prescriptionValide,
  type PrescripteurAControler,
  type TypeAppareillage,
} from './prescription';
import { eligibiliteRenouvellement, type Delivrance } from './renouvellement';
import { baseRemboursement, plafondC2S, plafondPrixVente, type TarifsAudio } from './tarifs';
import { trancheAge } from './tranche-age';
import { ventilation } from './ventilation';

export interface OffreDevis {
  readonly classe: ClasseLpp;
  readonly prixTTC: Centimes;
  readonly priseEnChargeAMC: Centimes;
}

export interface OreilleDevis {
  readonly oreille: Oreille;
  readonly type: TypeAppareillage;
  readonly offres: readonly OffreDevis[];
}

export interface DevisAControler {
  readonly dateNaissance: string;
  readonly dateDevis: string;
  readonly dateFinValidite: string;
  /** Date de référence de l'âge (R2). */
  readonly dateDelivrancePrevue: string;
  readonly c2s: boolean;
  readonly refusOffreC2S: boolean;
  readonly surdicecite: boolean;
  readonly contratResponsable: boolean;
  readonly tauxAMO: number;
  readonly prescription: {
    readonly prescripteur: PrescripteurAControler;
    readonly datePrescription: string;
  } | null;
  readonly bobineTPresentee: boolean;
  readonly ficheTechniqueJointe: boolean;
  /** Oreilles à appareiller, avec leurs offres. */
  readonly oreilles: readonly OreilleDevis[];
  readonly historiqueDelivrances: readonly Delivrance[];
}

export interface ResultatControleDevis {
  readonly erreurs: readonly Constat[];
  readonly avertissements: readonly Constat[];
}

function constatsDevis(codes: readonly (CodeControle | false)[]): Constat[] {
  return codes.flatMap((code) => (code === false ? [] : [{ code, oreille: null }]));
}

/**
 * Contrôles portant sur tout le devis.
 * Source : modele-devis-audio.pdf p. 1 (prescription préalable, validité d'au moins 2 mois, fiche
 * technique) et p. 2 § 2 (bobine T) ; convention-audioprothesistes.pdf, art. 18 3°, p. 19 et 20.
 */
function erreursDevis(devis: DevisAControler): Constat[] {
  const finMinimale = ajouterMois(devis.dateDevis, VALIDITE_MINIMALE_DEVIS_MOIS.valeur);
  return constatsDevis([
    devis.oreilles.length === 0 && 'AUCUNE_OREILLE_APPAREILLEE',
    devis.dateFinValidite < finMinimale && 'VALIDITE_DEVIS_INSUFFISANTE',
    devis.prescription === null && 'PRESCRIPTION_ABSENTE',
    !devis.bobineTPresentee && 'BOBINE_T_NON_PRESENTEE',
    !devis.ficheTechniqueJointe && 'FICHE_TECHNIQUE_MANQUANTE',
  ]);
}

/**
 * Le patient change de tranche entre le devis et la dernière date de délivrance possible.
 * À VÉRIFIER : la date de référence de l'âge n'est fixée par aucun texte (R2).
 */
function trancheInstable(devis: DevisAControler): boolean {
  const dates = [devis.dateDevis, devis.dateDelivrancePrevue, devis.dateFinValidite];
  return new Set(dates.map((date) => trancheAge(devis.dateNaissance, date))).size > 1;
}

/**
 * Prix d'une offre face au plafond applicable.
 * Source : convention-audioprothesistes.pdf, art. 25, p. 24 et art. 29 § 2, p. 27.
 */
function erreurPrix(
  offre: OffreDevis,
  devis: DevisAControler,
  age: number,
  tarifs: TarifsAudio,
): CodeControle | null {
  const plafond = plafondPrixVente({ ...devis, classe: offre.classe, age }, tarifs);
  if (plafond === null || offre.prixTTC <= plafond) {
    return null;
  }
  return devis.c2s && !devis.refusOffreC2S
    ? 'PRIX_SUPERIEUR_PLAFOND_C2S'
    : 'PRIX_SUPERIEUR_PRIX_LIMITE';
}

/**
 * Le bénéficiaire qui refuse l'offre paie la différence, qui figure au devis.
 * Source : convention-audioprothesistes.pdf, art. 29 § 2, p. 27.
 */
function depassementC2S(offre: OffreDevis, devis: DevisAControler, age: number): boolean {
  return devis.c2s && devis.refusOffreC2S && offre.prixTTC > plafondC2S({ ...devis, age });
}

/** À VÉRIFIER : plafond de 1 700 € absent de docs/ref (R14), simple avertissement. */
function depassementContratResponsable(
  offre: OffreDevis,
  devis: DevisAControler,
  age: number,
  tarifs: TarifsAudio,
): boolean {
  const { amo, amc } = ventilation({
    ...offre,
    baseRemboursement: baseRemboursement({ age }, tarifs),
    tauxAMO: devis.tauxAMO,
  });
  return devis.contratResponsable && amo + amc > PLAFOND_CONTRAT_RESPONSABLE.valeur;
}

function sansDoublons(constats: readonly Constat[]): Constat[] {
  const uniques = new Map(constats.map((c) => [`${c.code}|${String(c.oreille)}`, c]));
  return [...uniques.values()];
}

/**
 * Contrôle d'un devis avant remise : les erreurs le bloquent, les avertissements sont à arbitrer.
 * L'offre de classe I pour chaque oreille vient de convention-audioprothesistes.pdf, art. 18 3°, p. 19
 * et ameli-100-sante-audio.pdf p. 1. Âge lu à la date de délivrance prévue (R2).
 * `tarifs` : tarifs LPP résolus à cette même date.
 */
export function controleDevis(devis: DevisAControler, tarifs: TarifsAudio): ResultatControleDevis {
  const age = ageAt(devis.dateNaissance, devis.dateDelivrancePrevue);
  const erreurs = erreursDevis(devis);
  const avertissements = constatsDevis([
    trancheInstable(devis) && 'TRANCHE_AGE_CHANGE_AVANT_DELIVRANCE',
  ]);

  for (const { oreille, type, offres } of devis.oreilles) {
    if (!offres.some((offre) => offre.classe === 'CLASSE_I')) {
      erreurs.push({ code: 'OFFRE_CLASSE_I_MANQUANTE', oreille });
    }
    for (const offre of offres) {
      const erreur = erreurPrix(offre, devis, age, tarifs);
      if (erreur !== null) {
        erreurs.push({ code: erreur, oreille });
      }
      if (depassementC2S(offre, devis, age)) {
        avertissements.push({ code: 'DEPASSEMENT_C2S_A_MENTIONNER', oreille });
      }
      if (depassementContratResponsable(offre, devis, age, tarifs)) {
        avertissements.push({ code: 'PLAFOND_CONTRAT_RESPONSABLE_DEPASSE', oreille });
      }
    }

    const { eligible } = eligibiliteRenouvellement({
      historiqueDelivrances: devis.historiqueDelivrances,
      oreille,
      date: devis.dateDelivrancePrevue,
    });
    if (!eligible) {
      avertissements.push({ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille });
    }

    if (devis.prescription) {
      const prescription = prescriptionValide({
        ...devis.prescription,
        age,
        type,
        dateDevis: devis.dateDevis,
      });
      erreurs.push(...prescription.erreurs.map((code) => ({ code, oreille: null })));
      avertissements.push(...prescription.avertissements.map((code) => ({ code, oreille })));
    }
  }

  return { erreurs: sansDoublons(erreurs), avertissements: sansDoublons(avertissements) };
}
