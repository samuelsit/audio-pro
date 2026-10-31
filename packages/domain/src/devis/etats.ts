import type { StatutDossier } from '../dossier/etats';

export const STATUTS_DEVIS = ['BROUILLON', 'EMIS', 'SIGNE', 'REMPLACE'] as const;
export type StatutDevis = (typeof STATUTS_DEVIS)[number];

export const LIBELLES_STATUTS_DEVIS: Readonly<Record<StatutDevis, string>> = {
  BROUILLON: 'Brouillon',
  EMIS: 'Émis',
  SIGNE: 'Signé',
  REMPLACE: 'Remplacé',
};

/** Seul un brouillon change : le patient détient une copie d'un devis émis (ADR-012). */
export function devisModifiable(statut: StatutDevis): boolean {
  return statut === 'BROUILLON';
}

/** Un devis émis ou signé se corrige par une nouvelle version. */
export function nouvelleVersionPossible(statut: StatutDevis): boolean {
  return statut === 'EMIS' || statut === 'SIGNE';
}

/** Avant la prescription, le devis n'a pas de base ; une fois à facturer, l'aide est délivrée. */
export function dossierAccepteDevis(statut: StatutDossier): boolean {
  return (
    statut === 'PRESCRIPTION_OK' ||
    statut === 'DEVIS_EMIS' ||
    statut === 'EN_ESSAI' ||
    statut === 'DEVIS_SIGNE'
  );
}

/**
 * Statut du dossier après l'émission d'un devis, `null` s'il ne change pas. Une version émise après la
 * signature rouvre l'essai : la signature est à recueillir de nouveau (ADR-012).
 */
export function statutDossierApresEmission(statut: StatutDossier): StatutDossier | null {
  if (statut === 'PRESCRIPTION_OK') {
    return 'DEVIS_EMIS';
  }
  return statut === 'DEVIS_SIGNE' ? 'EN_ESSAI' : null;
}

/** Choix d'organisation : un devis échu se remplace par une nouvelle version (ADR-012). */
export function devisEchu(dateFinValidite: string, dateDuJour: string): boolean {
  return dateDuJour > dateFinValidite;
}
