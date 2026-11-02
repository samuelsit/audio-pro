import { coche, texte } from '@/lib/formulaire';

// Lecture du formulaire patient (création, modification, création depuis la carte Vitale).

const CHAMPS_TEXTE = [
  'centreId',
  'civilite',
  'nomNaissance',
  'nomUsage',
  'prenoms',
  'dateNaissance',
  'sexe',
  'adresseLigne1',
  'adresseLigne2',
  'codePostal',
  'ville',
  'telephone',
  'email',
  'medecinTraitant',
  'notes',
  'amoNir',
  'amoRangNaissance',
  'amoQualite',
  'amoRegime',
  'amoCaisse',
  'amoCentreGestionnaire',
  'amoFinDroits',
  'amcOrganismeNom',
  'amcOrganismeIdentifiant',
  'amcNumeroAdherent',
  'amcTypeContrat',
  'amcDebutValidite',
  'amcFinValidite',
] as const;

const CHAMPS_COCHES = [
  'consentementSms',
  'consentementSmsCommercial',
  'consentementEmailCommercial',
  'consentementCourrierCommercial',
  'consentementEmail',
  'consentementCourrier',
  'amoC2s',
  'amoAld',
] as const;

/** Saisie brute du formulaire patient, validée ensuite par le service. */
export function saisie(formData: FormData): Record<string, string | boolean> {
  return Object.fromEntries([
    ...CHAMPS_TEXTE.map((champ) => [champ, texte(formData, champ)]),
    ...CHAMPS_COCHES.map((champ) => [champ, coche(formData, champ)]),
  ]);
}
