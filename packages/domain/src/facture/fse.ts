import type { Oreille } from '../audio-rules/code-prestation';
import type { Centimes } from '../money';
import type { FseDraft, LigneFse } from '../ports/billing-engine';
import type { StatutFse } from '../ports/billing-engine';

/** Ligne figée de la facture, telle que lue pour la FSE. */
export interface LigneFactureFse {
  readonly codeLpp: string | null;
  readonly codePrestation: string | null;
  readonly oreille: Oreille | null;
  readonly numeroSerie: string | null;
  readonly quantite: number;
  readonly prixTTC: Centimes;
  readonly baseRemboursement: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

export type EntreeFse = Omit<FseDraft, 'lignes' | 'totaux'> & {
  readonly lignes: readonly LigneFactureFse[];
};

/** Seules les lignes codées et remboursables partent en FSE : l'entretien et le hors LPP restent. */
function versLigneFse(ligne: LigneFactureFse): LigneFse[] {
  const { codeLpp, codePrestation } = ligne;
  if (codeLpp === null || codePrestation === null || ligne.baseRemboursement === 0) {
    return [];
  }
  return [{ ...ligne, codeLpp, codePrestation, montantFacture: ligne.prixTTC }];
}

/**
 * Prépare la FSE d'une facture validée. `null` si aucune ligne n'est remboursable.
 * Source : convention-audioprothesistes.pdf, art. 28, p. 26 et art. 32 ; fr201-codes-prestation.pdf,
 * cas de tests n° 6 à 10 (prescripteur, date de prescription, code, montant, base, parts).
 * À VÉRIFIER : le format réel sera aligné sur AreaFSE à l'étape 26 (docs/vendor/areafse vide).
 */
export function construireFseDraft({ lignes, ...entree }: EntreeFse): FseDraft | null {
  const lignesFse = lignes.flatMap(versLigneFse);
  if (lignesFse.length === 0) {
    return null;
  }
  const somme = (champ: 'montantFacture' | 'amo' | 'amc') =>
    lignesFse.reduce((total, ligne) => total + ligne[champ], 0);
  return {
    ...entree,
    lignes: lignesFse,
    totaux: { montantFacture: somme('montantFacture'), amo: somme('amo'), amc: somme('amc') },
  };
}

/** Une FSE rejetée se renvoie. Une FSE en cours ou acceptée ne repart pas : l'envoi est idempotent. */
export function fseAEnvoyer(statut: StatutFse | null): boolean {
  return statut === null || statut === 'REJETEE';
}

/** Alerte à l'avoir : la correction d'une FSE déjà partie arrive à l'étape 26 (ADR-028). */
export function avoirAvecFseEnCours(statut: StatutFse | null): boolean {
  return statut === 'TRANSMISE' || statut === 'ACCEPTEE';
}
