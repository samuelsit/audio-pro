import { memeBeneficiaire, type IdentiteComparable } from '../patient/doublons';
import type { BeneficiaireVitale } from '../ports/vitale-reader';

/** Identité d'un bénéficiaire de la carte, comparable à une fiche (empreinte calculée par le serveur). */
export function identiteDepuisBeneficiaire(
  beneficiaire: BeneficiaireVitale,
  nirEmpreinte: string,
): IdentiteComparable {
  return {
    nomNaissance: beneficiaire.nom,
    nomUsage: null,
    dateNaissance: beneficiaire.dateNaissance,
    nirEmpreinte,
    qualite: beneficiaire.qualite,
    rangNaissance: beneficiaire.rang,
  };
}

/**
 * La fiche désigne le bénéficiaire lu : même NIR pour le même bénéficiaire (deux assurés, ou deux ayants
 * droit nés le même jour avec le même rang), règle des doublons de l'étape 3 (ADR-006).
 * Source et réserves : voir `memeBeneficiaire` (À VÉRIFIER : NIR de l'ouvrant droit porté par les
 * ayants droit, absent de docs/ref).
 */
export function ficheCorrespondAuBeneficiaire(
  beneficiaire: BeneficiaireVitale,
  nirEmpreinte: string,
  fiche: IdentiteComparable,
): boolean {
  return memeBeneficiaire(identiteDepuisBeneficiaire(beneficiaire, nirEmpreinte), fiche);
}
