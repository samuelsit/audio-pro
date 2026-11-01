export const STATUTS_COMMANDE = [
  'BROUILLON',
  'A_APPROUVER',
  'APPROUVEE',
  'ENVOYEE',
  'PARTIELLEMENT_RECUE',
  'RECUE',
  'FACTUREE',
  'CLOSE',
  'ANNULEE',
] as const;
export type StatutCommande = (typeof STATUTS_COMMANDE)[number];

export const LIBELLES_STATUTS_COMMANDE: Readonly<Record<StatutCommande, string>> = {
  BROUILLON: 'Brouillon',
  A_APPROUVER: 'À approuver',
  APPROUVEE: 'Approuvée',
  ENVOYEE: 'Envoyée',
  PARTIELLEMENT_RECUE: 'Partiellement reçue',
  RECUE: 'Reçue',
  FACTUREE: 'Facturée',
  CLOSE: 'Close',
  ANNULEE: 'Annulée',
};

const TRANSITIONS: Readonly<Record<StatutCommande, readonly StatutCommande[]>> = {
  BROUILLON: ['A_APPROUVER', 'APPROUVEE', 'ANNULEE'],
  // Le refus rend la demande à son auteur, qui peut la corriger.
  A_APPROUVER: ['APPROUVEE', 'BROUILLON', 'ANNULEE'],
  APPROUVEE: ['ENVOYEE', 'ANNULEE'],
  ENVOYEE: ['PARTIELLEMENT_RECUE', 'RECUE', 'ANNULEE'],
  PARTIELLEMENT_RECUE: ['RECUE'],
  // Une commande toute en consignation n'attend pas de facture.
  RECUE: ['FACTUREE', 'CLOSE'],
  FACTUREE: ['CLOSE'],
  CLOSE: [],
  ANNULEE: [],
};

export function transitionCommandeAutorisee(de: StatutCommande, vers: StatutCommande): boolean {
  return TRANSITIONS[de].includes(vers);
}

/** Tant qu'elle n'est pas soumise, une demande se modifie librement. */
export function commandeModifiable(statut: StatutCommande): boolean {
  return statut === 'BROUILLON';
}

/** Le prix manquant se complète jusqu'à l'approbation : la ligne se fige ensuite (trigger). */
export function prixCommandeModifiable(statut: StatutCommande): boolean {
  return statut === 'BROUILLON' || statut === 'A_APPROUVER';
}

export interface QuantitesLigne {
  readonly quantite: number;
  readonly quantiteRecue: number;
  readonly quantiteFacturee: number;
  readonly quantiteAbandonnee: number;
  readonly enConsignation: boolean;
}

/** Ce qui reste attendu : un surplus reçu sur une ligne ne compense pas un manque sur une autre. */
export function resteARecevoir(ligne: QuantitesLigne): number {
  return Math.max(0, ligne.quantite - ligne.quantiteAbandonnee - ligne.quantiteRecue);
}

function entierementFacturee(lignes: readonly QuantitesLigne[]): boolean {
  const attendues = lignes.filter((l) => !l.enConsignation && l.quantiteRecue > 0);
  return attendues.length > 0 && attendues.every((l) => l.quantiteFacturee >= l.quantiteRecue);
}

/**
 * Statut que les quantités imposent à une commande partie chez le fabricant. Une facture peut précéder la
 * livraison : elle est rapprochée, mais `FACTUREE` attend que tout soit reçu. Choix de gestion (ADR-031).
 */
export function statutSelonQuantites(
  statut: StatutCommande,
  lignes: readonly QuantitesLigne[],
): StatutCommande {
  if (
    !(['ENVOYEE', 'PARTIELLEMENT_RECUE', 'RECUE', 'FACTUREE'] as const).some((s) => s === statut)
  ) {
    return statut;
  }
  const recue = lignes.some((l) => l.quantiteRecue > 0);
  if (!recue) {
    return 'ENVOYEE';
  }
  if (lignes.some((l) => resteARecevoir(l) > 0)) {
    return 'PARTIELLEMENT_RECUE';
  }
  return entierementFacturee(lignes) ? 'FACTUREE' : 'RECUE';
}

/** Close à la main, une fois tout traité : facturée, ou reçue sans rien à facturer. */
export function commandeCloturable(
  statut: StatutCommande,
  lignes: readonly QuantitesLigne[],
  ecartsOuverts: number,
): boolean {
  if (ecartsOuverts > 0) {
    return false;
  }
  return statut === 'FACTUREE' || (statut === 'RECUE' && lignes.every((l) => l.enConsignation));
}

/** Une commande dont quelque chose est arrivé ne s'annule plus : le reliquat s'abandonne, ligne par ligne. */
export function commandeAnnulable(
  statut: StatutCommande,
  lignes: readonly QuantitesLigne[],
): boolean {
  return (
    transitionCommandeAutorisee(statut, 'ANNULEE') && lignes.every((l) => l.quantiteRecue === 0)
  );
}
