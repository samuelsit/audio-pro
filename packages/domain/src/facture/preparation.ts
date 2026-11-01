import { choisirCodeLpp, type CodeLppCandidat } from '../audio-rules/code-lpp';
import { codePrestation, type CodePrestation, type Oreille } from '../audio-rules/code-prestation';
import { baseRemboursement, plafondC2S, type TarifsAudio } from '../audio-rules/tarifs';
import { partAMCC2S, ventilation } from '../audio-rules/ventilation';
import type { ClasseLpp, NatureAccessoire } from '../catalogue';
import { prixHT } from '../devis/calcul';
import { additionnerCentimes, centimes, type Centimes } from '../money';
import { ageAt } from '../patient/age';
import { tauxTvaEnVigueur, type TauxTvaDate } from './tva';
import type { NatureLigneFacture } from './types';

export interface AideAPreparer {
  readonly oreille: Oreille;
  readonly classe: ClasseLpp;
  readonly libelle: string;
  /** Prix unitaire net de remise. */
  readonly prixTTC: Centimes;
  readonly numeroSerie: string | null;
  /** Appareil délivré, `null` si l'essai n'en porte plus sur cette oreille. */
  readonly appareilId: string | null;
  /** Codes du modèle valides à la date de délivrance. */
  readonly candidatsLpp: readonly CodeLppCandidat[];
}

export interface TarifConsommable {
  readonly baseRemboursement: Centimes;
  readonly naturePrestation: string;
}

/** Piles, accessoires et entretien : devis signé, vente directe ou ligne ajoutée au brouillon. */
export interface ConsommableAPreparer {
  readonly nature: NatureAccessoire | 'ENTRETIEN';
  readonly libelle: string;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
  readonly codeLpp: string | null;
  /** Article du stock à débiter, `null` pour l'entretien ou hors catalogue. */
  readonly accessoireId: string | null;
  /** Tarif unitaire à la date de délivrance ; `null` : aucun remboursement. */
  readonly tarif: TarifConsommable | null;
}

export interface EntreePreparation {
  readonly dateNaissance: string;
  readonly dateDelivrance: string;
  readonly c2s: boolean;
  readonly surdicecite: boolean;
  readonly tauxAMO: number;
  readonly aides: readonly AideAPreparer[];
  readonly consommables: readonly ConsommableAPreparer[];
  /** Montant d'une prise en charge accordée, `null` sinon. */
  readonly montantAccorde: Centimes | null;
  readonly tarifs: TarifsAudio;
  readonly tauxTva: readonly TauxTvaDate[];
}

export interface LigneFacture {
  readonly nature: NatureLigneFacture;
  readonly oreille: Oreille | null;
  /** Classe de l'aide, `null` sur un consommable. */
  readonly classe: ClasseLpp | null;
  readonly libelle: string;
  readonly quantite: number;
  readonly codeLpp: string | null;
  readonly codeLppGenerique: boolean;
  /** `null` sur une ligne d'entretien. */
  readonly codePrestation: CodePrestation | null;
  readonly numeroSerie: string | null;
  readonly appareilId: string | null;
  readonly accessoireId: string | null;
  readonly prixUnitaire: Centimes;
  readonly prixTTC: Centimes;
  /** Pour dix mille, `null` si aucun taux ne couvre la date : la validation est bloquée. */
  readonly tauxTva: number | null;
  readonly montantHT: Centimes;
  readonly montantTva: Centimes;
  readonly baseRemboursement: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

export interface TotauxFacture {
  readonly prixTTC: Centimes;
  readonly ht: Centimes;
  readonly tva: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

/** Contenu calculé d'une facture, figé à la validation (ADR-028). */
export interface ContenuFacture {
  readonly dateDelivrance: string;
  readonly lignes: readonly LigneFacture[];
  readonly totaux: TotauxFacture;
  /** Part du montant accordé qui dépasse ce qui reste après l'AMO. */
  readonly amcNonAffectee: Centimes;
}

/**
 * Répartit le montant accordé en proportion du reste après AMO de chaque ligne, sans jamais le dépasser ;
 * les arrondis cumulés amènent le dernier centime sur la dernière ligne. Ce qui dépasse le total des
 * restes n'est pas affecté.
 * À VÉRIFIER : choix applicatif, la saisie ne donne qu'un montant par dossier (R23).
 */
export function repartirAmc(montant: Centimes, restes: readonly Centimes[]): Centimes[] {
  const total = restes.reduce<number>((somme, reste) => somme + reste, 0);
  if (total === 0) {
    return restes.map(() => centimes(0));
  }
  const aRepartir = Math.min(montant, total);
  let cumulRestes = 0;
  let cumulParts = 0;
  return restes.map((reste) => {
    cumulRestes += reste;
    const cumul = Math.floor((aRepartir * cumulRestes) / total);
    const part = centimes(cumul - cumulParts);
    cumulParts = cumul;
    return part;
  });
}

const ORDRE_OREILLES: Readonly<Record<Oreille, number>> = { DROITE: 0, GAUCHE: 1 };

/** Ligne avant la part AMC ; `plafondC2S` borne la prise en charge d'un bénéficiaire. */
interface LigneBrute {
  readonly ligne: Omit<
    LigneFacture,
    'amo' | 'amc' | 'resteACharge' | 'tauxTva' | 'montantHT' | 'montantTva'
  >;
  readonly plafondC2S: Centimes;
}

interface LigneAvecAmo extends LigneBrute {
  readonly amo: Centimes;
}

function ligneAide(aide: AideAPreparer, entree: EntreePreparation): LigneBrute {
  const { c2s, surdicecite, tarifs } = entree;
  const age = ageAt(entree.dateNaissance, entree.dateDelivrance);
  const base = baseRemboursement({ age }, tarifs);
  const { oreille, classe, libelle, prixTTC, numeroSerie, appareilId, candidatsLpp } = aide;
  const { code, generique } = choisirCodeLpp({
    classe,
    oreille,
    c2s,
    age,
    baseRemboursement: base,
    candidats: candidatsLpp,
  });
  return {
    ligne: {
      nature: 'AIDE_AUDITIVE',
      oreille,
      classe,
      libelle,
      quantite: 1,
      codeLpp: code,
      codeLppGenerique: generique,
      codePrestation: codePrestation({ classe, oreille, c2s }),
      numeroSerie,
      appareilId,
      accessoireId: null,
      prixUnitaire: prixTTC,
      prixTTC,
      baseRemboursement: base,
    },
    plafondC2S: plafondC2S({ age, surdicecite }),
  };
}

function ligneConsommable(consommable: ConsommableAPreparer): LigneBrute {
  const { nature, libelle, quantite, prixUnitaire, codeLpp, accessoireId, tarif } = consommable;
  const prestation = nature === 'ENTRETIEN' ? null : codePrestation({ nature });
  const base = centimes((tarif?.baseRemboursement ?? 0) * quantite);
  return {
    ligne: {
      nature,
      oreille: null,
      classe: null,
      libelle,
      quantite,
      codeLpp,
      codeLppGenerique: tarif !== null && tarif.naturePrestation !== prestation,
      codePrestation: prestation,
      numeroSerie: null,
      appareilId: null,
      accessoireId,
      prixUnitaire,
      prixTTC: centimes(prixUnitaire * quantite),
      baseRemboursement: base,
    },
    plafondC2S: base,
  };
}

/**
 * TVA d'une ligne au taux de la date : le TTC reste la référence, le HT s'en déduit (`prixHT`).
 * À VÉRIFIER : taux et fait générateur absents de docs/ref (R18).
 */
function partsTva(
  { nature, prixTTC }: LigneBrute['ligne'],
  { tauxTva, dateDelivrance }: EntreePreparation,
) {
  const taux = tauxTvaEnVigueur(tauxTva, nature, dateDelivrance);
  const montantHT = taux === null ? prixTTC : prixHT(prixTTC, taux);
  return { tauxTva: taux, montantHT, montantTva: centimes(prixTTC - montantHT) };
}

/** AMC de chaque ligne : C2S calculée, PEC accordée répartie, sinon rien (R13, R23). */
function partsAmc(lignes: readonly LigneAvecAmo[], { c2s, montantAccorde }: EntreePreparation) {
  if (c2s) {
    return lignes.map(({ ligne, plafondC2S: plafond, amo }) =>
      partAMCC2S({ prixTTC: ligne.prixTTC, plafond, amo }),
    );
  }
  if (montantAccorde === null) {
    return lignes.map(() => centimes(0));
  }
  return repartirAmc(
    montantAccorde,
    lignes.map(({ ligne, amo }) => centimes(ligne.prixTTC - amo)),
  );
}

/**
 * Lignes de la facture à la date de délivrance : base, AMO et code LPP s'y recalculent, le devis signé ne
 * fournit que les articles et leurs prix. Aucune écriture : le contenu se fige à la validation (ADR-028).
 * Source : voir `ventilation`, `baseRemboursement`, `codePrestation`, `choisirCodeLpp`, `partAMCC2S`
 * (R4 à R7, R13) ; convention-audioprothesistes.pdf, art. 27, p. 26 (date de délivrance).
 */
export function preparerFacture(entree: EntreePreparation): ContenuFacture {
  const { tauxAMO, aides, consommables, dateDelivrance, c2s, montantAccorde } = entree;
  const ventiler = ({ prixTTC, baseRemboursement: base }: LigneBrute['ligne'], amc: Centimes) =>
    ventilation({
      prixTTC,
      baseRemboursement: base,
      tauxAMO,
      priseEnChargeAMC: amc,
    });
  const brutes = [
    ...[...aides]
      .sort((a, b) => ORDRE_OREILLES[a.oreille] - ORDRE_OREILLES[b.oreille])
      .map((aide) => ligneAide(aide, entree)),
    ...consommables.map(ligneConsommable),
  ].map((brute) => ({ ...brute, amo: ventiler(brute.ligne, centimes(0)).amo }));
  const amcs = partsAmc(brutes, entree);
  const lignes = brutes.map(({ ligne }, index) => ({
    ...ligne,
    ...partsTva(ligne, entree),
    ...ventiler(ligne, amcs[index] as Centimes),
  }));
  const somme = (montant: (ligne: LigneFacture) => Centimes) =>
    additionnerCentimes(...lignes.map(montant));
  const totaux = {
    prixTTC: somme((l) => l.prixTTC),
    ht: somme((l) => l.montantHT),
    tva: somme((l) => l.montantTva),
    amo: somme((l) => l.amo),
    amc: somme((l) => l.amc),
    resteACharge: somme((l) => l.resteACharge),
  };
  const accorde = c2s || montantAccorde === null ? 0 : montantAccorde;
  return {
    dateDelivrance,
    lignes,
    totaux,
    amcNonAffectee: centimes(Math.max(0, accorde - totaux.amc)),
  };
}
