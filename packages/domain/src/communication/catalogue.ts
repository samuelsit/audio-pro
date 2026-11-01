export const CANAUX_MESSAGE = ['SMS', 'EMAIL', 'COURRIER'] as const;
export type CanalMessage = (typeof CANAUX_MESSAGE)[number];

export const LIBELLES_CANAUX_MESSAGE: Readonly<Record<CanalMessage, string>> = {
  SMS: 'SMS',
  EMAIL: 'E-mail',
  COURRIER: 'Courrier',
};

export const FINALITES_MESSAGE = ['SUIVI', 'COMMERCIAL'] as const;
export type FinaliteMessage = (typeof FINALITES_MESSAGE)[number];

export const LIBELLES_FINALITES_MESSAGE: Readonly<Record<FinaliteMessage, string>> = {
  SUIVI: 'Suivi',
  COMMERCIAL: 'Commercial',
};

export const SCENARIOS_COMMUNICATION = [
  'RAPPEL_RDV_J2',
  'RAPPEL_RDV_J1',
  'CONFIRMATION_RDV',
  'DEPLACEMENT_RDV',
  'ANNULATION_RDV',
  'RELANCE_DEVIS',
  'FIN_ESSAI',
  'CONTROLE_ANNUEL',
  'RENOUVELLEMENT',
  'FIN_GARANTIE',
  'ANNIVERSAIRE',
] as const;
export type ScenarioCommunication = (typeof SCENARIOS_COMMUNICATION)[number];

export const LIBELLES_SCENARIOS: Readonly<Record<ScenarioCommunication, string>> = {
  RAPPEL_RDV_J2: 'Rappel de rendez-vous à J-2',
  RAPPEL_RDV_J1: 'Rappel de rendez-vous à J-1',
  CONFIRMATION_RDV: 'Confirmation de rendez-vous',
  DEPLACEMENT_RDV: 'Rendez-vous déplacé',
  ANNULATION_RDV: 'Rendez-vous annulé',
  RELANCE_DEVIS: 'Relance des devis non signés',
  FIN_ESSAI: 'Fin d’essai proche',
  CONTROLE_ANNUEL: 'Contrôle à venir',
  RENOUVELLEMENT: 'Renouvellement possible',
  FIN_GARANTIE: 'Fin de garantie',
  ANNIVERSAIRE: 'Anniversaire d’appareillage',
};

/**
 * À VÉRIFIER : la frontière entre message de suivi et message commercial n'est dans aucun document de docs/ref
 * (ADR-033). Un consentement commercial distinct est demandé dès qu'un message peut déclencher une vente.
 */
export const FINALITE_SCENARIO: Readonly<Record<ScenarioCommunication, FinaliteMessage>> = {
  RAPPEL_RDV_J2: 'SUIVI',
  RAPPEL_RDV_J1: 'SUIVI',
  CONFIRMATION_RDV: 'SUIVI',
  DEPLACEMENT_RDV: 'SUIVI',
  ANNULATION_RDV: 'SUIVI',
  RELANCE_DEVIS: 'COMMERCIAL',
  FIN_ESSAI: 'SUIVI',
  CONTROLE_ANNUEL: 'SUIVI',
  RENOUVELLEMENT: 'COMMERCIAL',
  FIN_GARANTIE: 'SUIVI',
  ANNIVERSAIRE: 'COMMERCIAL',
};

export type ScenarioRdv = Extract<
  ScenarioCommunication,
  'RAPPEL_RDV_J2' | 'RAPPEL_RDV_J1' | 'CONFIRMATION_RDV' | 'DEPLACEMENT_RDV' | 'ANNULATION_RDV'
>;

const SCENARIOS_RDV: readonly ScenarioCommunication[] = [
  'RAPPEL_RDV_J2',
  'RAPPEL_RDV_J1',
  'CONFIRMATION_RDV',
  'DEPLACEMENT_RDV',
  'ANNULATION_RDV',
];

export function estScenarioRdv(scenario: ScenarioCommunication): scenario is ScenarioRdv {
  return SCENARIOS_RDV.includes(scenario);
}

/** Premier canal disponible, dans cet ordre : un événement fait un seul message. */
export const CANAUX_SCENARIO_DEFAUT: readonly CanalMessage[] = ['SMS', 'EMAIL'];
