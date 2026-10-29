import type { AmcSaisie, AmoSaisie, OrigineDonnee, PatientSaisie } from '../patient/patient';
import { normaliserPourRecherche } from '../patient/recherche';
import type { BeneficiaireVitale } from '../ports/vitale-reader';

/**
 * Champs d'une fiche que la lecture de la carte peut mettre à jour, dans l'ordre d'affichage.
 * - `nom` : le nom d'usage s'il est renseigné, sinon le nom de naissance ;
 * - `amo` : la couverture AMO entière, proposée d'un bloc quand la fiche n'en a pas ;
 * - champs AMO un par un quand la fiche a déjà une couverture ;
 * - `amc` : bloc indivisible (on ne mélange pas deux contrats), proposé seulement si la carte en porte une.
 */
export const CHAMPS_CARTE = [
  'nom',
  'prenoms',
  'dateNaissance',
  'amo',
  'nir',
  'qualite',
  'rangNaissance',
  'regime',
  'caisse',
  'centreGestionnaire',
  'finDroits',
  'c2s',
  'ald',
  'amc',
] as const;
export type ChampCarte = (typeof CHAMPS_CARTE)[number];

export const LIBELLES_CHAMPS_CARTE: Readonly<Record<ChampCarte, string>> = {
  nom: 'Nom',
  prenoms: 'Prénoms',
  dateNaissance: 'Date de naissance',
  amo: 'Couverture AMO',
  nir: 'NIR',
  qualite: 'Qualité',
  rangNaissance: 'Rang de naissance',
  regime: 'Régime',
  caisse: 'Caisse',
  centreGestionnaire: 'Centre gestionnaire',
  finDroits: 'Fin de droits',
  c2s: 'C2S',
  ald: 'ALD',
  amc: 'Couverture AMC',
};

const CHAMPS_AMO = [
  'nir',
  'qualite',
  'rangNaissance',
  'regime',
  'caisse',
  'centreGestionnaire',
  'finDroits',
  'c2s',
  'ald',
] as const satisfies readonly (ChampCarte & keyof AmoSaisie)[];

const CHAMPS_AMC = [
  'organismeNom',
  'organismeIdentifiant',
  'numeroAdherent',
  'typeContrat',
  'debutValidite',
  'finValidite',
] as const satisfies readonly (keyof AmcSaisie)[];

/** Couverture AMO telle que la carte la décrit. */
export function amoDepuisCarte(beneficiaire: BeneficiaireVitale): AmoSaisie {
  return {
    nir: beneficiaire.nir,
    rangNaissance: beneficiaire.rang,
    qualite: beneficiaire.qualite,
    regime: beneficiaire.regime,
    caisse: beneficiaire.caisse,
    centreGestionnaire: beneficiaire.centreGestionnaire,
    finDroits: beneficiaire.droitsAmo.fin,
    c2s: beneficiaire.c2s,
    ald: beneficiaire.ald,
  };
}

function memeAmc(a: AmcSaisie | null, b: AmcSaisie | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return CHAMPS_AMC.every((champ) => a[champ] === b[champ]);
}

function memeAmo(a: AmoSaisie | null, b: AmoSaisie): boolean {
  return a !== null && CHAMPS_AMO.every((champ) => a[champ] === b[champ]);
}

/** Valeur comparée : texte, nombre, booléen, couverture entière ou absence. */
export type ValeurComparee = string | number | boolean | AmoSaisie | AmcSaisie | null;

/** Valeur actuelle de la fiche pour un champ de la carte. */
export function valeurFiche(saisie: PatientSaisie, champ: ChampCarte): ValeurComparee {
  switch (champ) {
    case 'nom':
      return saisie.nomUsage ?? saisie.nomNaissance;
    case 'prenoms':
    case 'dateNaissance':
      return saisie[champ];
    case 'amo':
      return saisie.amo;
    case 'amc':
      return saisie.amc;
    default:
      return saisie.amo === null ? null : saisie.amo[champ];
  }
}

/** Valeur portée par la carte pour un champ. */
export function valeurCarte(beneficiaire: BeneficiaireVitale, champ: ChampCarte): ValeurComparee {
  switch (champ) {
    case 'nom':
      return beneficiaire.nom;
    case 'prenoms':
      return beneficiaire.prenom;
    case 'dateNaissance':
      return beneficiaire.dateNaissance;
    case 'amc':
      return beneficiaire.amc;
    case 'amo':
      return amoDepuisCarte(beneficiaire);
    default:
      return amoDepuisCarte(beneficiaire)[champ];
  }
}

/**
 * Les prénoms de la carte (souvent le seul premier prénom, en majuscules et sans accents) concordent avec
 * ceux de la fiche s'ils sont égaux sans accents ni casse, ou s'ils en sont le premier.
 */
function prenomsConcordent(fiche: string, carte: string): boolean {
  const f = normaliserPourRecherche(fiche);
  const c = normaliserPourRecherche(carte);
  return f === c || f.split(' ')[0] === c;
}

/** Le champ est proposé à la mise à jour : il s'applique à cette fiche et sa valeur diffère. */
function differe(
  saisie: PatientSaisie,
  beneficiaire: BeneficiaireVitale,
  champ: ChampCarte,
): boolean {
  switch (champ) {
    case 'nom':
      return (
        normaliserPourRecherche(saisie.nomUsage ?? saisie.nomNaissance) !==
        normaliserPourRecherche(beneficiaire.nom)
      );
    case 'prenoms':
      return !prenomsConcordent(saisie.prenoms, beneficiaire.prenom);
    case 'dateNaissance':
      return saisie.dateNaissance !== beneficiaire.dateNaissance;
    case 'amo':
      return saisie.amo === null;
    case 'amc':
      return beneficiaire.amc !== null && !memeAmc(saisie.amc, beneficiaire.amc);
    default:
      return saisie.amo !== null && saisie.amo[champ] !== amoDepuisCarte(beneficiaire)[champ];
  }
}

/** Champs où la carte diffère de la fiche, dans l'ordre d'affichage. */
export function comparerAvecCarte(
  saisie: PatientSaisie,
  beneficiaire: BeneficiaireVitale,
): ChampCarte[] {
  return CHAMPS_CARTE.filter((champ) => differe(saisie, beneficiaire, champ));
}

/**
 * Fiche après la lecture : chaque champ accepté qui diffère prend la valeur de la carte, les autres
 * gardent celle de la fiche. Un champ accepté qui ne s'applique pas (ex. `nir` sans couverture AMO)
 * est ignoré.
 */
export function appliquerCarte(
  saisie: PatientSaisie,
  beneficiaire: BeneficiaireVitale,
  acceptes: readonly ChampCarte[],
): PatientSaisie {
  const aAppliquer = comparerAvecCarte(saisie, beneficiaire).filter((champ) =>
    acceptes.includes(champ),
  );
  const carte = amoDepuisCarte(beneficiaire);
  let resultat: PatientSaisie = saisie;
  let amo: AmoSaisie | null = saisie.amo;
  for (const champ of aAppliquer) {
    switch (champ) {
      case 'nom':
        resultat =
          saisie.nomUsage === null
            ? { ...resultat, nomNaissance: beneficiaire.nom }
            : { ...resultat, nomUsage: beneficiaire.nom };
        break;
      case 'prenoms':
        resultat = { ...resultat, prenoms: beneficiaire.prenom };
        break;
      case 'dateNaissance':
        resultat = { ...resultat, dateNaissance: beneficiaire.dateNaissance };
        break;
      case 'amo':
        amo = carte;
        break;
      case 'amc':
        resultat = { ...resultat, amc: beneficiaire.amc };
        break;
      default:
        // Champ AMO : `differe` garantit que la fiche a une couverture.
        amo = { ...(amo as AmoSaisie), [champ]: carte[champ] };
    }
  }
  return { ...resultat, amo };
}

/**
 * Origine de la couverture AMO enregistrée après une lecture : « carte Vitale » si elle est identique à
 * celle de la carte, « saisie manuelle » sinon (mise à jour refusée en partie ou saisie retouchée).
 */
export function origineApresLecture(
  amo: AmoSaisie | null,
  beneficiaire: BeneficiaireVitale,
): OrigineDonnee {
  return memeAmo(amo, amoDepuisCarte(beneficiaire)) ? 'VITALE' : 'SAISIE';
}
