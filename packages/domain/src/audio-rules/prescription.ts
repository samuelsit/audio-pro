import type { SpecialitePrescripteur } from '../prescripteur';
import { AGE_SEUIL_PRESCRIPTION } from './constantes';
import type { CodeControle } from './controles';

export const TYPES_APPAREILLAGE = ['PRIMO', 'RENOUVELLEMENT'] as const;
export type TypeAppareillage = (typeof TYPES_APPAREILLAGE)[number];

export interface PrescripteurAControler {
  readonly specialite: SpecialitePrescripteur;
  readonly formationOtologie: boolean | null;
}

export interface EntreePrescription {
  readonly prescripteur: PrescripteurAControler;
  readonly age: number;
  readonly type: TypeAppareillage;
  readonly datePrescription: string;
  readonly dateDevis: string;
}

export interface ResultatPrescription {
  readonly valide: boolean;
  readonly erreurs: readonly CodeControle[];
  readonly avertissements: readonly CodeControle[];
}

/**
 * Qualité du prescripteur selon l'âge et le type d'appareillage.
 * À VÉRIFIER : aucun document de docs/ref ne porte cette règle (R10) ; elle reprend la table fournie
 * par le métier, d'où un simple avertissement. Âge en années révolues : « 6 ans ou moins » va donc
 * jusqu'à la veille des 7 ans.
 */
function controlePrescripteur(
  { specialite, formationOtologie }: PrescripteurAControler,
  age: number,
  type: TypeAppareillage,
): CodeControle | null {
  if (specialite === 'ORL') {
    return null;
  }
  if (age <= AGE_SEUIL_PRESCRIPTION.valeur) {
    return 'PRESCRIPTEUR_NON_CONFORME';
  }
  if (type === 'RENOUVELLEMENT') {
    return specialite === 'AUTRE' ? 'SPECIALITE_A_CONTROLER' : null;
  }
  if (specialite === 'AUTRE' || formationOtologie === false) {
    return 'PRESCRIPTEUR_NON_CONFORME';
  }
  return formationOtologie === null ? 'FORMATION_OTOLOGIE_INCONNUE' : null;
}

/**
 * Prescription antérieure au devis (erreur) et qualité du prescripteur (avertissement). La durée de
 * validité de l'ordonnance n'est pas contrôlée.
 * Source : modele-devis-audio.pdf p. 1 (« prescription médicale préalable obligatoire »).
 * À VÉRIFIER : durée de validité absente de docs/ref (R11), aucune valeur inventée.
 */
export function prescriptionValide({
  prescripteur,
  age,
  type,
  datePrescription,
  dateDevis,
}: EntreePrescription): ResultatPrescription {
  const erreurs: CodeControle[] =
    datePrescription > dateDevis ? ['PRESCRIPTION_POSTERIEURE_AU_DEVIS'] : [];
  const avertissement = controlePrescripteur(prescripteur, age, type);
  return {
    valide: erreurs.length === 0,
    erreurs,
    avertissements: avertissement === null ? [] : [avertissement],
  };
}
