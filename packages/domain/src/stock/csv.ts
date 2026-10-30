import type { CelluleCsv } from '../commun/csv';
import { LIBELLES_STATUTS_APPAREIL, type StatutAppareil } from './etats';

const ENTETES_STOCK = [
  'Centre',
  'Fabricant',
  'Gamme',
  'Modèle',
  'Numéro de série',
  'Statut',
  'Date de réception',
  'Bon de livraison',
  'Facture fabricant',
  'En consignation',
] as const;

export const ENTETES_CSV_STOCK_ACCESSOIRES = [
  'Centre',
  'Accessoire',
  'Nature',
  'Quantité',
] as const;

/** Une ligne du stock. Jamais d'identité de patient dans cet export. */
export interface LigneCsvStock {
  readonly centre: string;
  readonly fabricant: string;
  readonly gamme: string;
  readonly modele: string;
  readonly numeroSerie: string;
  readonly statut: StatutAppareil;
  readonly dateReception: string;
  readonly referenceBonLivraison: string;
  readonly referenceFactureFabricant: string | null;
  readonly enConsignation: boolean;
  readonly prixAchatCentimes: number | null;
}

/** La colonne du prix d'achat n'existe que pour un profil autorisé. */
export function entetesCsvStock(avecPrix: boolean): readonly string[] {
  return avecPrix ? [...ENTETES_STOCK, 'Prix d’achat (euros)'] : ENTETES_STOCK;
}

export function cellulesCsvStock(ligne: LigneCsvStock, avecPrix: boolean): readonly CelluleCsv[] {
  const cellules = [
    ligne.centre,
    ligne.fabricant,
    ligne.gamme,
    ligne.modele,
    ligne.numeroSerie,
    LIBELLES_STATUTS_APPAREIL[ligne.statut],
    ligne.dateReception,
    ligne.referenceBonLivraison,
    ligne.referenceFactureFabricant,
    ligne.enConsignation ? 'oui' : 'non',
  ];
  if (!avecPrix) {
    return cellules;
  }
  const prix = ligne.prixAchatCentimes;
  return [...cellules, prix === null ? null : (prix / 100).toFixed(2).replace('.', ',')];
}
