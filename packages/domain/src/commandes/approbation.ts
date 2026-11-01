export const TYPES_PRODUIT_COMMANDE = ['APPAREIL', 'ACCESSOIRE', 'PILE'] as const;
export type TypeProduitCommande = (typeof TYPES_PRODUIT_COMMANDE)[number];

export const LIBELLES_TYPE_PRODUIT: Readonly<Record<TypeProduitCommande, string>> = {
  APPAREIL: 'Appareils',
  ACCESSOIRE: 'Accessoires',
  PILE: 'Piles',
};

export const DECISIONS_REGLE = ['ENVOI_DIRECT', 'APPROBATION'] as const;
export type DecisionRegle = (typeof DECISIONS_REGLE)[number];

export const LIBELLES_DECISION_REGLE: Readonly<Record<DecisionRegle, string>> = {
  ENVOI_DIRECT: 'Envoi direct',
  APPROBATION: 'Approbation requise',
};

export interface RegleApprobation {
  readonly id: string;
  readonly priorite: number;
  readonly montantMaxCentimes: number | null;
  readonly typeProduit: TypeProduitCommande | null;
  readonly fournisseurId: string | null;
  readonly centreId: string | null;
  readonly decision: DecisionRegle;
}

export interface CommandeAEvaluer {
  /** Nul si un prix manque. */
  readonly montantCentimes: number | null;
  readonly typesProduit: readonly TypeProduitCommande[];
  readonly fournisseurId: string;
  readonly centreId: string;
}

export interface DecisionApprobation {
  readonly decision: DecisionRegle;
  readonly regleId: string | null;
}

/** Montant de la commande, ou `null` si un prix manque : on ne décide pas d'un envoi sur un montant partiel. */
export function montantCommande(
  lignes: readonly { quantite: number; prixAchatCentimes: number | null }[],
): number | null {
  let total = 0;
  for (const { quantite, prixAchatCentimes } of lignes) {
    if (prixAchatCentimes === null) {
      return null;
    }
    total += quantite * prixAchatCentimes;
  }
  return total;
}

function regleCorrespond(regle: RegleApprobation, commande: CommandeAEvaluer): boolean {
  const { montantMaxCentimes, typeProduit, fournisseurId, centreId } = regle;
  return (
    (montantMaxCentimes === null ||
      (commande.montantCentimes !== null && commande.montantCentimes <= montantMaxCentimes)) &&
    (typeProduit === null || commande.typesProduit.every((t) => t === typeProduit)) &&
    (fournisseurId === null || fournisseurId === commande.fournisseurId) &&
    (centreId === null || centreId === commande.centreId)
  );
}

/**
 * Décide de l'envoi d'une commande. Règle de gestion, sans texte de référence (ADR-031) : la première règle qui
 * correspond, par priorité croissante, l'emporte. Sans règle ou sans montant connu, un humain approuve.
 */
export function deciderApprobation(
  regles: readonly RegleApprobation[],
  commande: CommandeAEvaluer,
): DecisionApprobation {
  if (commande.montantCentimes === null) {
    return { decision: 'APPROBATION', regleId: null };
  }
  const regle = [...regles]
    .sort((a, b) => a.priorite - b.priorite || a.id.localeCompare(b.id))
    .find((r) => regleCorrespond(r, commande));
  return regle
    ? { decision: regle.decision, regleId: regle.id }
    : { decision: 'APPROBATION', regleId: null };
}
