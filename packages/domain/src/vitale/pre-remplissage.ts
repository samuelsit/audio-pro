import type { BeneficiaireVitale } from '../ports/vitale-reader';

/** Valeurs initiales du formulaire de création (noms des champs du formulaire patient). */
export interface PreRemplissagePatient {
  readonly nomNaissance: string;
  readonly prenoms: string;
  readonly dateNaissance: string;
  readonly amoNir: string;
  readonly amoRangNaissance: string;
  readonly amoQualite: string;
  readonly amoRegime: string;
  readonly amoCaisse: string;
  readonly amoCentreGestionnaire: string;
  readonly amoFinDroits: string;
  readonly amoC2s: boolean;
  readonly amoAld: boolean;
  readonly amcOrganismeNom: string;
  readonly amcOrganismeIdentifiant: string;
  readonly amcNumeroAdherent: string;
  readonly amcTypeContrat: string;
  readonly amcDebutValidite: string;
  readonly amcFinValidite: string;
}

/**
 * Formulaire de création pré-rempli depuis la carte. Le nom lu va dans le nom de naissance, à corriger
 * s'il s'agit d'un nom d'usage. La civilité et le sexe restent à choisir : le lien entre le premier
 * caractère du NIR et le sexe ne figure pas dans docs/ref, et un ayant droit porte le NIR de l'assuré.
 */
export function preRemplissageDepuisBeneficiaire(b: BeneficiaireVitale): PreRemplissagePatient {
  return {
    nomNaissance: b.nom,
    prenoms: b.prenom,
    dateNaissance: b.dateNaissance,
    amoNir: b.nir,
    amoRangNaissance: String(b.rang),
    amoQualite: b.qualite,
    amoRegime: b.regime ?? '',
    amoCaisse: b.caisse ?? '',
    amoCentreGestionnaire: b.centreGestionnaire ?? '',
    amoFinDroits: b.droitsAmo.fin ?? '',
    amoC2s: b.c2s,
    amoAld: b.ald,
    amcOrganismeNom: b.amc?.organismeNom ?? '',
    amcOrganismeIdentifiant: b.amc?.organismeIdentifiant ?? '',
    amcNumeroAdherent: b.amc?.numeroAdherent ?? '',
    amcTypeContrat: b.amc?.typeContrat ?? '',
    amcDebutValidite: b.amc?.debutValidite ?? '',
    amcFinValidite: b.amc?.finValidite ?? '',
  };
}
