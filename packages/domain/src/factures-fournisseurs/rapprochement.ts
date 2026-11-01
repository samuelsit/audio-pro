import type { TypeEcartAchat } from '../commandes/reception';
import type { LigneExtraite } from './extraction';

export interface LigneFactureARapprocher {
  readonly id: string;
  readonly commandeLigneId: string | null;
  readonly quantite: number;
  readonly prixUnitaireCentimes: number;
  readonly numerosSerie: readonly string[];
}

export interface LigneCommandeARapprocher {
  readonly id: string;
  readonly commandeId: string;
  readonly reference: string | null;
  /** Un appareil se facture avec ses numéros de série. */
  readonly suiviAuNumero: boolean;
  readonly quantiteRecue: number;
  /** Déjà sur des factures validées. */
  readonly quantiteFacturee: number;
  readonly prixAchatCentimes: number | null;
  readonly numerosRecus: readonly string[];
  readonly numerosDejaFactures: readonly string[];
}

export interface TotauxAchat {
  readonly montantHtCentimes: number;
  readonly montantTvaCentimes: number;
  readonly montantTtcCentimes: number;
}

export interface EcartRapproche {
  readonly type: TypeEcartAchat;
  readonly factureLigneId: string | null;
  readonly commandeLigneId: string | null;
  readonly commandeId: string | null;
  readonly quantiteAttendue: number | null;
  readonly quantiteConstatee: number | null;
  readonly montantAttenduCentimes: number | null;
  readonly montantConstateCentimes: number | null;
  readonly numeroSerie: string | null;
}

const ECART_VIDE = {
  factureLigneId: null,
  commandeLigneId: null,
  commandeId: null,
  quantiteAttendue: null,
  quantiteConstatee: null,
  montantAttenduCentimes: null,
  montantConstateCentimes: null,
  numeroSerie: null,
} as const;

function ecartsDeTotaux(
  lignes: readonly LigneFactureARapprocher[],
  { montantHtCentimes, montantTvaCentimes, montantTtcCentimes }: TotauxAchat,
): EcartRapproche[] {
  const somme = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaireCentimes, 0);
  const ecarts: EcartRapproche[] = [];
  if (somme !== montantHtCentimes) {
    ecarts.push({
      ...ECART_VIDE,
      type: 'TOTAL_INCOHERENT',
      montantAttenduCentimes: somme,
      montantConstateCentimes: montantHtCentimes,
    });
  }
  if (montantHtCentimes + montantTvaCentimes !== montantTtcCentimes) {
    ecarts.push({
      ...ECART_VIDE,
      type: 'TOTAL_INCOHERENT',
      montantAttenduCentimes: montantHtCentimes + montantTvaCentimes,
      montantConstateCentimes: montantTtcCentimes,
    });
  }
  return ecarts;
}

function ecartsDeSeries(
  ligne: LigneFactureARapprocher,
  commande: LigneCommandeARapprocher,
  base: Pick<EcartRapproche, 'factureLigneId' | 'commandeLigneId' | 'commandeId'>,
): EcartRapproche[] {
  const ecarts: EcartRapproche[] = [];
  for (const numeroSerie of ligne.numerosSerie) {
    if (commande.numerosDejaFactures.includes(numeroSerie)) {
      ecarts.push({ ...ECART_VIDE, ...base, type: 'SERIE_DEJA_FACTUREE', numeroSerie });
    } else if (!commande.numerosRecus.includes(numeroSerie)) {
      ecarts.push({ ...ECART_VIDE, ...base, type: 'SERIE_INCONNUE', numeroSerie });
    }
  }
  if (commande.suiviAuNumero && ligne.numerosSerie.length < ligne.quantite) {
    ecarts.push({
      ...ECART_VIDE,
      ...base,
      type: 'SERIE_ABSENTE',
      quantiteAttendue: ligne.quantite,
      quantiteConstatee: ligne.numerosSerie.length,
    });
  }
  return ecarts;
}

/**
 * Rapprochement à trois : commande, réception, facture. Règle de gestion, sans texte de référence (ADR-031). Le prix
 * se compare à celui de la commande, à la tolérance près ; la quantité, à ce qui est reçu : une facture qui précède
 * la livraison est donc signalée, et la réception lève ensuite l'écart.
 */
export function rapprocher(
  lignes: readonly LigneFactureARapprocher[],
  commandes: readonly LigneCommandeARapprocher[],
  totaux: TotauxAchat,
  tolerancePrixCentimes: number,
): EcartRapproche[] {
  const ecarts = ecartsDeTotaux(lignes, totaux);
  const cumul = new Map<string, number>();
  for (const ligne of lignes) {
    const commande = commandes.find((c) => c.id === ligne.commandeLigneId);
    if (!commande) {
      ecarts.push({
        ...ECART_VIDE,
        type: 'LIGNE_NON_COMMANDEE',
        factureLigneId: ligne.id,
        montantConstateCentimes: ligne.quantite * ligne.prixUnitaireCentimes,
      });
      continue;
    }
    const base = {
      factureLigneId: ligne.id,
      commandeLigneId: commande.id,
      commandeId: commande.commandeId,
    };
    const { prixAchatCentimes } = commande;
    if (
      prixAchatCentimes !== null &&
      Math.abs(ligne.prixUnitaireCentimes - prixAchatCentimes) > tolerancePrixCentimes
    ) {
      ecarts.push({
        ...ECART_VIDE,
        ...base,
        type: 'PRIX',
        montantAttenduCentimes: prixAchatCentimes,
        montantConstateCentimes: ligne.prixUnitaireCentimes,
      });
    }
    cumul.set(commande.id, (cumul.get(commande.id) ?? 0) + ligne.quantite);
    ecarts.push(...ecartsDeSeries(ligne, commande, base));
  }
  for (const commande of commandes) {
    const facturee = commande.quantiteFacturee + (cumul.get(commande.id) ?? 0);
    if (facturee > commande.quantiteRecue) {
      ecarts.push({
        ...ECART_VIDE,
        type: 'QUANTITE_FACTUREE',
        commandeLigneId: commande.id,
        commandeId: commande.commandeId,
        quantiteAttendue: commande.quantiteRecue,
        quantiteConstatee: facturee,
      });
    }
  }
  return ecarts;
}

/**
 * Propose la ligne de commande d'une ligne extraite : par numéro de série reçu, sinon par référence. Une
 * proposition seulement, et rien plutôt qu'un lien douteux.
 */
export function proposerLigneCommande(
  ligne: Pick<LigneExtraite, 'reference' | 'numerosSerie'>,
  commandes: readonly LigneCommandeARapprocher[],
): string | null {
  const parSerie = commandes.find((c) =>
    ligne.numerosSerie.some((n) => c.numerosRecus.includes(n)),
  );
  if (parSerie) {
    return parSerie.id;
  }
  const [seule, ...autres] = commandes.filter(
    (c) => c.reference !== null && c.reference === ligne.reference,
  );
  return seule !== undefined && autres.length === 0 ? seule.id : null;
}
