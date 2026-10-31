import type { ClasseLpp } from '../catalogue';
import { ajouterMois } from '../commun/date';
import type { Centimes } from '../money';
import { ageAt } from '../patient/age';
import type { Oreille } from './code-prestation';
import {
  OPTIONS_MINIMUM_OFFRE_100_SANTE,
  PLAFOND_CONTRAT_RESPONSABLE,
  VALIDITE_MINIMALE_DEVIS_MOIS,
} from './constantes';
import { sansDoublons, type CodeControle, type Constat } from './controles';
import {
  prescriptionValide,
  type PrescripteurAControler,
  type TypeAppareillage,
} from './prescription';
import { eligibiliteRenouvellement, type Delivrance } from './renouvellement';
import { baseRemboursement, plafondC2S, plafondPrixVente, type TarifsAudio } from './tarifs';
import { trancheAge } from './tranche-age';
import { ventilation } from './ventilation';

export const RUBRIQUES_OFFRE = ['OFFRE_100_SANTE', 'AUTRE_OFFRE'] as const;
export type RubriqueOffre = (typeof RUBRIQUES_OFFRE)[number];

export interface OffreDevis {
  /** Rubrique du devis normalisé : 1.1 ou 1.2. */
  readonly rubrique: RubriqueOffre;
  readonly classe: ClasseLpp;
  readonly prixTTC: Centimes;
  readonly priseEnChargeAMC: Centimes;
  /** Nombre d'options de l'aide parmi les 8 du devis normalisé. */
  readonly nombreOptions: number;
  readonly ficheComplete: boolean;
}

export interface OreilleDevis {
  readonly oreille: Oreille;
  readonly type: TypeAppareillage;
  /** Exigée en renouvellement. */
  readonly datePrecedentAppareillage: string | null;
  readonly offres: readonly OffreDevis[];
}

export interface ConsommableDevis {
  readonly rubrique: RubriqueOffre;
  readonly remboursable: boolean;
  readonly ficheComplete: boolean;
}

export interface EntrepriseDevis {
  readonly raisonSociale: string | null;
  readonly siret: string | null;
  readonly rcs: string | null;
  readonly finess: string | null;
  readonly tvaIntracommunautaire: string | null;
}

export interface DevisAControler {
  readonly dateNaissance: string;
  readonly dateDevis: string;
  readonly dateFinValidite: string;
  /** Date de référence de l'âge (R2). */
  readonly dateDelivrancePrevue: string;
  readonly c2s: boolean;
  readonly refusOffreC2S: boolean;
  readonly surdicecite: boolean;
  readonly contratResponsable: boolean;
  readonly tauxAMO: number;
  readonly prescription: {
    readonly prescripteur: PrescripteurAControler;
    readonly datePrescription: string;
  } | null;
  readonly bobineTPresentee: boolean;
  readonly ficheTechniqueJointe: boolean;
  /** Oreilles à appareiller, avec leurs offres. */
  readonly oreilles: readonly OreilleDevis[];
  readonly consommables: readonly ConsommableDevis[];
  readonly entreprise: EntrepriseDevis;
  readonly historiqueDelivrances: readonly Delivrance[];
}

export interface ResultatControleDevis {
  readonly erreurs: readonly Constat[];
  readonly avertissements: readonly Constat[];
}

function constatsDevis(codes: readonly (CodeControle | false)[]): Constat[] {
  return codes.flatMap((code) => (code === false ? [] : [{ code, oreille: null }]));
}

/**
 * Contrôles portant sur tout le devis.
 * Source : modele-devis-audio.pdf p. 1 (prescription préalable, validité d'au moins 2 mois, fiche
 * technique, marque et référence des consommables, note 1 : seuls les produits remboursables figurent
 * en 1.1) et p. 2 § 2 (bobine T) et pied de page (identification de l'entreprise) ;
 * convention-audioprothesistes.pdf, art. 18 3°, p. 19 et 20.
 * `IDENTIFICATION_ENTREPRISE_INCOMPLETE` se limite à la raison sociale et au SIRET.
 * À VÉRIFIER : caractère obligatoire de chaque identifiant, une structure pouvant ne pas avoir de RCS.
 */
function erreursDevis(devis: DevisAControler): Constat[] {
  const finMinimale = ajouterMois(devis.dateDevis, VALIDITE_MINIMALE_DEVIS_MOIS.valeur);
  const { raisonSociale, siret } = devis.entreprise;
  return constatsDevis([
    devis.oreilles.length === 0 && 'AUCUNE_OREILLE_APPAREILLEE',
    devis.dateFinValidite < finMinimale && 'VALIDITE_DEVIS_INSUFFISANTE',
    devis.prescription === null && 'PRESCRIPTION_ABSENTE',
    !devis.bobineTPresentee && 'BOBINE_T_NON_PRESENTEE',
    !devis.ficheTechniqueJointe && 'FICHE_TECHNIQUE_MANQUANTE',
    devis.consommables.some((c) => c.rubrique === 'OFFRE_100_SANTE' && !c.remboursable) &&
      'LIGNE_NON_REMBOURSABLE_OFFRE_100_SANTE',
    devis.consommables.some((c) => !c.ficheComplete) && 'FICHE_CATALOGUE_INCOMPLETE',
    (raisonSociale === null || siret === null) && 'IDENTIFICATION_ENTREPRISE_INCOMPLETE',
  ]);
}

/** À VÉRIFIER : identifiants d'entreprise simplement signalés (voir `erreursDevis`). */
function identifiantsIncomplets({ rcs, finess, tvaIntracommunautaire }: EntrepriseDevis): boolean {
  return rcs === null || finess === null || tvaIntracommunautaire === null;
}

/**
 * Exigences propres à une oreille : offre 1.1 de classe I, ses options, les mentions du catalogue et la
 * date du précédent appareillage.
 * Source : convention-audioprothesistes.pdf, art. 18 3°, p. 19 ; ameli-100-sante-audio.pdf p. 1 ;
 * modele-devis-audio.pdf p. 1 (en-tête, § 1.1 et tableaux des offres).
 */
function erreursOreille({ oreille, type, datePrecedentAppareillage, offres }: OreilleDevis) {
  const classeI = offres.filter(
    (offre) => offre.rubrique === 'OFFRE_100_SANTE' && offre.classe === 'CLASSE_I',
  );
  const codes: (CodeControle | false)[] = [
    classeI.length === 0 && 'OFFRE_CLASSE_I_MANQUANTE',
    classeI.some((offre) => offre.nombreOptions < OPTIONS_MINIMUM_OFFRE_100_SANTE.valeur) &&
      'OPTIONS_100_SANTE_INSUFFISANTES',
    offres.some((offre) => !offre.ficheComplete) && 'FICHE_CATALOGUE_INCOMPLETE',
    type === 'RENOUVELLEMENT' &&
      datePrecedentAppareillage === null &&
      'DATE_PRECEDENT_APPAREILLAGE_MANQUANTE',
  ];
  return codes.flatMap((code) => (code === false ? [] : [{ code, oreille }]));
}

/**
 * Le patient change de tranche entre le devis et la dernière date de délivrance possible.
 * À VÉRIFIER : la date de référence de l'âge n'est fixée par aucun texte (R2).
 */
function trancheInstable(devis: DevisAControler): boolean {
  const dates = [devis.dateDevis, devis.dateDelivrancePrevue, devis.dateFinValidite];
  return new Set(dates.map((date) => trancheAge(devis.dateNaissance, date))).size > 1;
}

/**
 * Prix d'une offre face au plafond applicable.
 * Source : convention-audioprothesistes.pdf, art. 25, p. 24 et art. 29 § 2, p. 27.
 */
function erreurPrix(
  offre: OffreDevis,
  devis: DevisAControler,
  age: number,
  tarifs: TarifsAudio,
): CodeControle | null {
  const plafond = plafondPrixVente({ ...devis, classe: offre.classe, age }, tarifs);
  if (plafond === null || offre.prixTTC <= plafond) {
    return null;
  }
  return devis.c2s && !devis.refusOffreC2S
    ? 'PRIX_SUPERIEUR_PLAFOND_C2S'
    : 'PRIX_SUPERIEUR_PRIX_LIMITE';
}

/**
 * Le bénéficiaire qui refuse l'offre paie la différence, qui figure au devis.
 * Source : convention-audioprothesistes.pdf, art. 29 § 2, p. 27.
 */
function depassementC2S(offre: OffreDevis, devis: DevisAControler, age: number): boolean {
  return devis.c2s && devis.refusOffreC2S && offre.prixTTC > plafondC2S({ ...devis, age });
}

/** À VÉRIFIER : plafond de 1 700 € absent de docs/ref (R14), simple avertissement. */
function depassementContratResponsable(
  offre: OffreDevis,
  devis: DevisAControler,
  age: number,
  tarifs: TarifsAudio,
): boolean {
  const { amo, amc } = ventilation({
    ...offre,
    baseRemboursement: baseRemboursement({ age }, tarifs),
    tauxAMO: devis.tauxAMO,
  });
  return devis.contratResponsable && amo + amc > PLAFOND_CONTRAT_RESPONSABLE.valeur;
}

/**
 * Contrôle d'un devis avant remise : les erreurs le bloquent, les avertissements sont à arbitrer.
 * Âge lu à la date de délivrance prévue (R2).
 * `tarifs` : tarifs LPP résolus à cette même date.
 */
export function controleDevis(devis: DevisAControler, tarifs: TarifsAudio): ResultatControleDevis {
  const age = ageAt(devis.dateNaissance, devis.dateDelivrancePrevue);
  const erreurs = erreursDevis(devis);
  const avertissements = constatsDevis([
    trancheInstable(devis) && 'TRANCHE_AGE_CHANGE_AVANT_DELIVRANCE',
    identifiantsIncomplets(devis.entreprise) && 'IDENTIFIANTS_ENTREPRISE_A_COMPLETER',
  ]);

  for (const donnees of devis.oreilles) {
    const { oreille, type, offres } = donnees;
    erreurs.push(...erreursOreille(donnees));
    for (const offre of offres) {
      const erreur = erreurPrix(offre, devis, age, tarifs);
      if (erreur !== null) {
        erreurs.push({ code: erreur, oreille });
      }
      if (depassementC2S(offre, devis, age)) {
        avertissements.push({ code: 'DEPASSEMENT_C2S_A_MENTIONNER', oreille });
      }
      if (depassementContratResponsable(offre, devis, age, tarifs)) {
        avertissements.push({ code: 'PLAFOND_CONTRAT_RESPONSABLE_DEPASSE', oreille });
      }
    }

    const { eligible } = eligibiliteRenouvellement({
      historiqueDelivrances: devis.historiqueDelivrances,
      oreille,
      date: devis.dateDelivrancePrevue,
    });
    if (!eligible) {
      avertissements.push({ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille });
    }

    if (devis.prescription) {
      const prescription = prescriptionValide({
        ...devis.prescription,
        age,
        type,
        dateDevis: devis.dateDevis,
      });
      erreurs.push(...prescription.erreurs.map((code) => ({ code, oreille: null })));
      avertissements.push(...prescription.avertissements.map((code) => ({ code, oreille })));
    }
  }

  return { erreurs: sansDoublons(erreurs), avertissements: sansDoublons(avertissements) };
}
