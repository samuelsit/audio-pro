import { normaliserPourRecherche } from '../patient/recherche';
import { telephoneCanonique } from '../patient/telephone';

export interface FichePatientCandidate {
  readonly id: string;
  readonly nomNaissance: string;
  readonly nomUsage: string | null;
  readonly prenoms: string;
  readonly dateNaissance: string;
  readonly telephone: string | null;
}

export interface IdentiteReservation {
  readonly nom: string;
  readonly prenom: string;
  readonly dateNaissance: string;
  /** Forme canonique, vérifiée par SMS. */
  readonly telephone: string;
}

function memeNom(fiche: FichePatientCandidate, nom: string): boolean {
  const cherche = normaliserPourRecherche(nom);
  return (
    normaliserPourRecherche(fiche.nomNaissance) === cherche ||
    (fiche.nomUsage !== null && normaliserPourRecherche(fiche.nomUsage) === cherche)
  );
}

function memePrenom(fiche: FichePatientCandidate, prenom: string): boolean {
  const cherche = normaliserPourRecherche(prenom);
  const prenoms = normaliserPourRecherche(fiche.prenoms);
  return prenoms === cherche || prenoms.startsWith(`${cherche} `);
}

/**
 * Fiche du patient qui réserve : même téléphone, même nom (de naissance ou d'usage) et même date de naissance.
 * Plusieurs fiches répondent (jumeaux au même numéro) : le prénom départage. Le doute reste un prospect, car
 * accrocher un rendez-vous à la mauvaise fiche serait pire qu'un doublon repéré à l'arrivée.
 */
export function rapprocherPatient(
  fiches: readonly FichePatientCandidate[],
  identite: IdentiteReservation,
): string | null {
  const concordantes = fiches.filter(
    (f) =>
      f.dateNaissance === identite.dateNaissance &&
      memeNom(f, identite.nom) &&
      f.telephone !== null &&
      telephoneCanonique(f.telephone) === identite.telephone,
  );
  if (concordantes.length === 1) {
    return (concordantes[0] as FichePatientCandidate).id;
  }
  const departagees = concordantes.filter((f) => memePrenom(f, identite.prenom));
  return departagees.length === 1 ? (departagees[0] as FichePatientCandidate).id : null;
}
