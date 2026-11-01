import type { TarifsAudio } from '../audio-rules/tarifs';
import { centimes, type Centimes } from '../money';
import type {
  DesignationAide,
  DesignationConsommable,
  LigneAide,
  LigneConsommable,
  OffreDonnees,
} from './types';

const TVA_AIDE = 550;
const TVA_CONSOMMABLE = 2000;

export const TARIFS: TarifsAudio = {
  VINGT_ET_PLUS: { baseRemboursement: centimes(40_000), prixLimiteClasseI: centimes(95_000) },
  MOINS_DE_20: { baseRemboursement: centimes(140_000), prixLimiteClasseI: centimes(140_000) },
};

export const TARIFS_CONSOMMABLES: ReadonlyMap<string, Centimes> = new Map([
  ['1111111', centimes(150)],
]);

export const AIDE_CLASSE_I: DesignationAide = {
  fabricant: 'Acoustia Démo',
  adresseFabricant: '1 rue de l’Exemple, 75000 Paris',
  mandataire: null,
  marque: 'Acoustia',
  gamme: 'Aurore',
  modele: 'Essentiel',
  referenceCommerciale: 'AU-ESS-1',
  lieuFabrication: 'UE',
  type: 'CONTOUR',
  classe: 'CLASSE_I',
  nombreCanaux: 12,
  connectivite: 'Bluetooth',
  antiLarsen: true,
  reducteurAcouphenes: true,
  bobineT: true,
  options: ['REDUCTEUR_ACOUPHENE', 'CONNECTIVITE_SANS_FIL', 'REDUCTEUR_BRUIT_VENT'],
};

export const AIDE_CLASSE_II: DesignationAide = {
  ...AIDE_CLASSE_I,
  gamme: 'Boréale',
  modele: 'Premium',
  referenceCommerciale: 'BO-PRE-1',
  lieuFabrication: 'HORS_UE',
  mandataire: 'Mandataire Démo, 2 rue de l’Essai, 69000 Lyon',
  type: 'RIC',
  classe: 'CLASSE_II',
  nombreCanaux: 24,
};

export const PILES: DesignationConsommable = {
  nom: 'Piles 312',
  marque: 'Rayonac',
  referenceCommerciale: 'RAY-312',
};

export function aide(
  oreille: LigneAide['oreille'],
  prix: number,
  designation: DesignationAide = AIDE_CLASSE_I,
  prixAvantRemise = prix,
): LigneAide {
  return {
    oreille,
    classe: designation.classe,
    prixUnitaireAvantRemise: centimes(prixAvantRemise),
    prixUnitaire: centimes(prix),
    tauxTVA: TVA_AIDE,
    designation,
  };
}

export function piles(
  quantite = 4,
  codeLpp: string | null = '1111111',
  prix = 150,
): LigneConsommable {
  return {
    nature: 'PILE',
    quantite,
    codeLpp,
    prixUnitaireAvantRemise: centimes(prix),
    prixUnitaire: centimes(prix),
    tauxTVA: TVA_CONSOMMABLE,
    designation: PILES,
  };
}

export function offre(modif: Partial<OffreDonnees> = {}): OffreDonnees {
  return {
    rubrique: 'OFFRE_100_SANTE',
    aides: [],
    consommables: [],
    amcDroite: null,
    amcGauche: null,
    amcConsommables: null,
    ...modif,
  };
}
