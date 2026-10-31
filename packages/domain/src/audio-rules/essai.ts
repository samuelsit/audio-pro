import { ajouterJours, joursEntre } from '../commun/date';
import {
  ESSAI_DUREE_MINIMALE_JOURS,
  ESSAI_PROLONGATION_MAX_JOURS,
  ESSAI_RDV_MINIMUM,
  ESSAI_SEUIL_ALERTE_JOURS,
} from './constantes';

export const ALERTES_ESSAI = [
  'PROLONGATION_SANS_DEMANDE_ECRITE',
  'PROLONGATION_EXCESSIVE',
  'ECHEANCE_PROCHE',
  'ECHEANCE_ATTEINTE',
  'ECHEANCE_DEPASSEE',
  'RDV_INSUFFISANTS',
] as const;
export type AlerteEssai = (typeof ALERTES_ESSAI)[number];

export const LIBELLES_ALERTES_ESSAI: Readonly<Record<AlerteEssai, string>> = {
  PROLONGATION_SANS_DEMANDE_ECRITE:
    'La prolongation exige une demande écrite du prescripteur : elle n’est pas retenue.',
  PROLONGATION_EXCESSIVE: 'La prolongation est limitée à 15 jours, soit 45 jours d’essai au total.',
  ECHEANCE_PROCHE: 'La fin de l’essai approche.',
  ECHEANCE_ATTEINTE: 'La période d’essai minimale est écoulée : l’essai est à conclure.',
  ECHEANCE_DEPASSEE: 'L’échéance est dépassée : l’essai reste à conclure.',
  RDV_INSUFFISANTS: 'L’essai doit comporter au moins 2 rendez-vous.',
};

export interface ProlongationEssai {
  readonly jours: number;
  readonly demandeEcrite: boolean;
}

export interface EntreeEssai {
  readonly debut: string;
  readonly prolongation: ProlongationEssai | null;
  /** Dates des rendez-vous ; seuls comptent ceux tenus entre le début et aujourd'hui. */
  readonly rdvs: readonly string[];
  readonly aujourdhui: string;
}

export interface EtatEssai {
  readonly joursEcoules: number;
  readonly echeance: string;
  /** Négatif une fois l'échéance passée. */
  readonly joursRestants: number;
  readonly rdvRealises: number;
  /** Durée atteinte et rendez-vous tenus : l'appareillage peut être facturé. */
  readonly facturable: boolean;
  readonly alertes: readonly AlerteEssai[];
}

function joursProlongation(prolongation: ProlongationEssai | null): number {
  return prolongation?.demandeEcrite
    ? Math.min(prolongation.jours, ESSAI_PROLONGATION_MAX_JOURS.valeur)
    : 0;
}

/**
 * État de la période d'adaptation probatoire : 30 jours au moins, prolongeables de 15 jours sur
 * demande écrite du prescripteur, 2 rendez-vous au moins, aucune facturation avant la fin.
 * Source : convention-audioprothesistes.pdf, art. 18 3°, p. 20 ; modele-devis-audio.pdf p. 2 § 3.
 * À VÉRIFIER : décompte (échéance = début + durée, R9). Le texte ne fixe pas de maximum sans
 * prolongation : au-delà de l'échéance, l'essai n'est pas interdit, on alerte seulement.
 */
export function etatEssai({ debut, prolongation, rdvs, aujourdhui }: EntreeEssai): EtatEssai {
  const duree = ESSAI_DUREE_MINIMALE_JOURS.valeur + joursProlongation(prolongation);
  const echeance = ajouterJours(debut, duree);
  const joursRestants = joursEntre(aujourdhui, echeance);
  const rdvRealises = rdvs.filter((rdv) => rdv >= debut && rdv <= aujourdhui).length;
  const rdvSuffisants = rdvRealises >= ESSAI_RDV_MINIMUM.valeur;

  const alertes: AlerteEssai[] = [];
  if (prolongation && !prolongation.demandeEcrite) {
    alertes.push('PROLONGATION_SANS_DEMANDE_ECRITE');
  }
  if (prolongation && prolongation.jours > ESSAI_PROLONGATION_MAX_JOURS.valeur) {
    alertes.push('PROLONGATION_EXCESSIVE');
  }
  if (joursRestants < 0) {
    alertes.push('ECHEANCE_DEPASSEE');
  } else if (joursRestants === 0) {
    alertes.push('ECHEANCE_ATTEINTE');
  } else if (joursRestants <= ESSAI_SEUIL_ALERTE_JOURS.valeur) {
    alertes.push('ECHEANCE_PROCHE');
  }
  if (joursRestants <= ESSAI_SEUIL_ALERTE_JOURS.valeur && !rdvSuffisants) {
    alertes.push('RDV_INSUFFISANTS');
  }

  return {
    joursEcoules: Math.max(0, joursEntre(debut, aujourdhui)),
    echeance,
    joursRestants,
    rdvRealises,
    facturable: joursRestants <= 0 && rdvSuffisants,
    alertes,
  };
}
