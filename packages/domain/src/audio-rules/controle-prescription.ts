import { ajouterJours } from '../commun/date';
import { ageAt } from '../patient/age';
import type { Oreille } from './code-prestation';
import { ESSAI_DUREE_MINIMALE_JOURS } from './constantes';
import { sansDoublons, type Constat } from './controles';
import {
  prescriptionValide,
  type PrescripteurAControler,
  type TypeAppareillage,
} from './prescription';
import { eligibiliteRenouvellement, type Delivrance } from './renouvellement';

export interface OreilleDossier {
  readonly oreille: Oreille;
  readonly type: TypeAppareillage;
}

export interface PrescriptionAControler {
  readonly dateNaissance: string;
  readonly dateDuJour: string;
  /** Oreilles du dossier, avec leur type d'appareillage. */
  readonly oreilles: readonly OreilleDossier[];
  readonly oreillesPrescrites: readonly Oreille[];
  readonly prescripteur: PrescripteurAControler & { readonly rpps: string | null };
  readonly datePrescription: string;
  readonly historiqueDelivrances: readonly Delivrance[];
}

export interface RefusRenouvellement {
  readonly oreille: Oreille;
  /** Première date de prise en charge sur cette oreille. */
  readonly dateEligibilite: string | null;
}

export interface ResultatControlePrescription {
  readonly erreurs: readonly Constat[];
  readonly avertissements: readonly Constat[];
  readonly refusRenouvellement: readonly RefusRenouvellement[];
}

/**
 * Date la plus proche à laquelle l'aide peut être délivrée : l'essai la sépare de la prescription.
 * Source : convention-audioprothesistes.pdf, art. 18 3°, p. 20 (essai) et art. 27, p. 26 (délivrance à
 * l'issue de l'essai).
 * À VÉRIFIER : aucun texte ne fixe la date de comparaison avant la délivrance réelle (R8).
 */
export function premiereDelivrancePossible(dateDuJour: string): string {
  return ajouterJours(dateDuJour, ESSAI_DUREE_MINIMALE_JOURS.valeur);
}

/**
 * Contrôle d'une prescription à son enregistrement, avant tout devis. Les erreurs bloquent, sauf forçage
 * par un ADMIN_CLIENT ; les avertissements sont conservés sur la prescription.
 * Le renouvellement avant 4 ans, simple avertissement dans `controleDevis`, est ici une erreur : le
 * dossier doit s'arrêter avant le devis (décision du 2026-10-31, ADR-011).
 * Le délai s'apprécie à la première délivrance possible, l'âge à la même date (R2).
 * Source : convention-audioprothesistes.pdf, art. 22 § 1, p. 22 ; modele-devis-audio.pdf p. 1.
 * `OREILLE_NON_PRESCRITE` et `RPPS_PRESCRIPTEUR_MANQUANT` sont des contrôles de cohérence, pas des règles.
 * À VÉRIFIER : exigence du RPPS du prescripteur (absente de docs/ref).
 */
export function controlePrescription({
  dateNaissance,
  dateDuJour,
  oreilles,
  oreillesPrescrites,
  prescripteur,
  datePrescription,
  historiqueDelivrances,
}: PrescriptionAControler): ResultatControlePrescription {
  const dateReference = premiereDelivrancePossible(dateDuJour);
  const age = ageAt(dateNaissance, dateReference);
  const erreurs: Constat[] = [];
  const avertissements: Constat[] =
    prescripteur.rpps === null ? [{ code: 'RPPS_PRESCRIPTEUR_MANQUANT', oreille: null }] : [];
  const refusRenouvellement: RefusRenouvellement[] = [];

  for (const { oreille, type } of oreilles) {
    if (!oreillesPrescrites.includes(oreille)) {
      erreurs.push({ code: 'OREILLE_NON_PRESCRITE', oreille });
    }

    const { eligible, dateEligibilite } = eligibiliteRenouvellement({
      historiqueDelivrances,
      oreille,
      date: dateReference,
    });
    if (!eligible) {
      erreurs.push({ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille });
      refusRenouvellement.push({ oreille, dateEligibilite });
    }

    // Aucun devis n'existe encore : la date du jour borne une prescription qui serait postérieure.
    const prescription = prescriptionValide({
      prescripteur,
      age,
      type,
      datePrescription,
      dateDevis: dateDuJour,
    });
    erreurs.push(...prescription.erreurs.map((code) => ({ code, oreille: null })));
    avertissements.push(...prescription.avertissements.map((code) => ({ code, oreille })));
  }

  return {
    erreurs: sansDoublons(erreurs),
    avertissements: sansDoublons(avertissements),
    refusRenouvellement,
  };
}
