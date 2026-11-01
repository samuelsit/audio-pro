import { telephoneCanonique } from '../patient/telephone';
import type { CanalMessage, FinaliteMessage } from './catalogue';

export interface ConsentementsPatient {
  readonly consentementSms: boolean;
  readonly consentementEmail: boolean;
  readonly consentementCourrier: boolean;
  readonly consentementSmsCommercial: boolean;
  readonly consentementEmailCommercial: boolean;
  readonly consentementCourrierCommercial: boolean;
}

export interface CoordonneesMessage {
  readonly telephone: string | null;
  readonly email: string | null;
  readonly adresseLigne1: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
}

export type PatientMessage = ConsentementsPatient & CoordonneesMessage;

export const MOTIFS_BLOCAGE = ['SANS_ADRESSE', 'SANS_CONSENTEMENT', 'OPPOSITION'] as const;
export type MotifBlocage = (typeof MOTIFS_BLOCAGE)[number];

export const LIBELLES_MOTIFS_BLOCAGE: Readonly<Record<MotifBlocage, string>> = {
  SANS_ADRESSE: 'Pas de coordonnée utilisable',
  SANS_CONSENTEMENT: 'Pas de consentement',
  OPPOSITION: 'Le patient s’est opposé à ce canal',
};

/** Champ du consentement pour ce canal et cette finalité. */
export function champConsentement(
  canal: CanalMessage,
  finalite: FinaliteMessage,
): keyof ConsentementsPatient {
  const racine = { SMS: 'Sms', EMAIL: 'Email', COURRIER: 'Courrier' } as const;
  const suffixe = finalite === 'COMMERCIAL' ? 'Commercial' : '';
  return `consentement${racine[canal]}${suffixe}` as keyof ConsentementsPatient;
}

/** Un SMS ne part que vers un mobile français, sous sa forme unique : un fixe ne le recevrait jamais. */
export function mobileCanonique(telephone: string | null): string | null {
  const canonique = telephone === null ? null : telephoneCanonique(telephone);
  return canonique !== null && /^\+33[67]/.test(canonique) ? canonique : null;
}

/** Forme unique d'une adresse : deux écritures de la même adresse ne font qu'une opposition. */
export function adresseCanonique(canal: CanalMessage, adresse: string): string {
  return canal === 'EMAIL' ? adresse.trim().toLowerCase() : adresse.trim();
}

/** Adresse du patient sur ce canal, sous forme canonique. `null` si elle manque ou ne peut pas servir. */
export function adresseMessage(patient: CoordonneesMessage, canal: CanalMessage): string | null {
  switch (canal) {
    case 'SMS':
      return mobileCanonique(patient.telephone);
    case 'EMAIL':
      return patient.email === null ? null : adresseCanonique('EMAIL', patient.email);
    case 'COURRIER':
      return patient.adresseLigne1 === null || patient.codePostal === null || patient.ville === null
        ? null
        : `${patient.adresseLigne1}, ${patient.codePostal} ${patient.ville}`;
  }
}

export type DecisionEnvoi =
  | { readonly autorise: true; readonly canal: CanalMessage; readonly adresse: string }
  | { readonly autorise: false; readonly canal: CanalMessage; readonly motif: MotifBlocage };

/**
 * Un message ne part que vers une adresse utilisable, sous consentement de sa finalité, sans opposition sur le
 * canal. L'opposition passe avant tout : elle coupe tout le canal, rappels compris (ADR-033).
 * À VÉRIFIER : base légale de ces envois, absente de docs/ref ; le consentement est appliqué par prudence.
 */
export function decisionEnvoi(
  patient: PatientMessage,
  canal: CanalMessage,
  finalite: FinaliteMessage,
  opposition: boolean,
): DecisionEnvoi {
  if (opposition) {
    return { autorise: false, canal, motif: 'OPPOSITION' };
  }
  const adresse = adresseMessage(patient, canal);
  if (adresse === null) {
    return { autorise: false, canal, motif: 'SANS_ADRESSE' };
  }
  return patient[champConsentement(canal, finalite)]
    ? { autorise: true, canal, adresse }
    : { autorise: false, canal, motif: 'SANS_CONSENTEMENT' };
}

/**
 * Premier canal autorisé, dans l'ordre du scénario : un événement fait un seul message. Sans canal autorisé,
 * le refus du premier canal, qui s'affiche sur la fiche. `canaux` n'est jamais vide (schéma de saisie).
 */
export function choisirCanal(
  patient: PatientMessage,
  canaux: readonly CanalMessage[],
  finalite: FinaliteMessage,
  oppositions: readonly CanalMessage[],
): DecisionEnvoi {
  const decisions = canaux.map((canal) =>
    decisionEnvoi(patient, canal, finalite, oppositions.includes(canal)),
  );
  return decisions.find((d) => d.autorise) ?? (decisions[0] as DecisionEnvoi);
}
