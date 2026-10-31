import { choisirCodeLpp, type CodeLppCandidat } from '../audio-rules/code-lpp';
import { codePrestation, type CodePrestation, type Oreille } from '../audio-rules/code-prestation';
import { baseRemboursement, plafondC2S, type TarifsAudio } from '../audio-rules/tarifs';
import { partAMCC2S, ventilation } from '../audio-rules/ventilation';
import type { ClasseLpp, NatureAccessoire } from '../catalogue';
import type { NatureLigneDevis } from '../devis/types';
import { additionnerCentimes, centimes, type Centimes } from '../money';
import { ageAt } from '../patient/age';

export interface AideAPreparer {
  readonly oreille: Oreille;
  readonly classe: ClasseLpp;
  readonly libelle: string;
  /** Prix unitaire net de remise. */
  readonly prixTTC: Centimes;
  readonly numeroSerie: string | null;
  /** Codes du modèle valides à la date de délivrance. */
  readonly candidatsLpp: readonly CodeLppCandidat[];
}

export interface TarifConsommable {
  readonly baseRemboursement: Centimes;
  readonly naturePrestation: string;
}

export interface ConsommableAPreparer {
  readonly nature: NatureAccessoire;
  readonly libelle: string;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
  readonly codeLpp: string | null;
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
}

export interface LigneFacture {
  readonly nature: NatureLigneDevis;
  readonly oreille: Oreille | null;
  /** Classe de l'aide, `null` sur un consommable. */
  readonly classe: ClasseLpp | null;
  readonly libelle: string;
  readonly quantite: number;
  readonly codeLpp: string | null;
  readonly codeLppGenerique: boolean;
  readonly codePrestation: CodePrestation;
  readonly numeroSerie: string | null;
  readonly prixTTC: Centimes;
  readonly baseRemboursement: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

export interface TotauxFacture {
  readonly prixTTC: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

/** Dossier prêt à facturer. Sans numéro ni encaissement : ils arrivent aux étapes 14 et 15 (ADR-015). */
export interface FacturePreparee {
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
  readonly ligne: Omit<LigneFacture, 'amo' | 'amc' | 'resteACharge'>;
  readonly plafondC2S: Centimes;
}

interface LigneAvecAmo extends LigneBrute {
  readonly amo: Centimes;
}

function ligneAide(aide: AideAPreparer, entree: EntreePreparation): LigneBrute {
  const { c2s, surdicecite, tarifs } = entree;
  const age = ageAt(entree.dateNaissance, entree.dateDelivrance);
  const base = baseRemboursement({ age }, tarifs);
  const { oreille, classe, libelle, prixTTC, numeroSerie, candidatsLpp } = aide;
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
      prixTTC,
      baseRemboursement: base,
    },
    plafondC2S: plafondC2S({ age, surdicecite }),
  };
}

function ligneConsommable(consommable: ConsommableAPreparer): LigneBrute {
  const { nature, libelle, quantite, prixUnitaire, codeLpp, tarif } = consommable;
  const prestation = codePrestation({ nature });
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
      prixTTC: centimes(prixUnitaire * quantite),
      baseRemboursement: base,
    },
    plafondC2S: base,
  };
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
 * fournit que les articles et leurs prix. Aucune écriture : le contenu se figera à la facture (ADR-015).
 * Source : voir `ventilation`, `baseRemboursement`, `codePrestation`, `choisirCodeLpp`, `partAMCC2S`
 * (R4 à R7, R13) ; convention-audioprothesistes.pdf, art. 27, p. 26 (date de délivrance).
 */
export function preparerFacture(entree: EntreePreparation): FacturePreparee {
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
    ...ventiler(ligne, amcs[index] as Centimes),
  }));
  const somme = (montant: (ligne: LigneFacture) => Centimes) =>
    additionnerCentimes(...lignes.map(montant));
  const totaux = {
    prixTTC: somme((l) => l.prixTTC),
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
