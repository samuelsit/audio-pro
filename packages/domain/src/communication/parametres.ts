import { z } from 'zod';

import { ESSAI_SEUIL_ALERTE_JOURS } from '../audio-rules/constantes';
import { entierEntre } from '../commandes/parametres';
import { AVANCE_CONTROLE_JOURS } from '../sav/suivi';
import { CANAUX_MESSAGE, type CanalMessage } from './catalogue';
import { PLAGE_ENVOI_DEFAUT, plageEnvoiSchema, type PlageEnvoi } from './plage-envoi';

export interface ParametresCommunication extends PlageEnvoi {
  /** Millièmes d'euro par crédit SMS. 0 tant que le client ne l'a pas renseigné. */
  readonly tarifSmsMillimes: number;
  readonly devisDelaiJours: number;
  readonly devisRelancesMax: number;
  readonly finEssaiAvanceJours: number;
  readonly controleAvanceJours: number;
  readonly garantieAvanceJours: number;
  readonly renouvellementFenetreJours: number;
}

/** À VÉRIFIER : délais choisis par l'éditeur, aucun texte de docs/ref ; chaque client les règle (R58). */
export const PARAMETRES_COMMUNICATION_DEFAUT: ParametresCommunication = {
  ...PLAGE_ENVOI_DEFAUT,
  tarifSmsMillimes: 0,
  devisDelaiJours: 7,
  devisRelancesMax: 2,
  finEssaiAvanceJours: ESSAI_SEUIL_ALERTE_JOURS.valeur,
  controleAvanceJours: AVANCE_CONTROLE_JOURS,
  garantieAvanceJours: 60,
  renouvellementFenetreJours: 30,
};

export const parametresCommunicationSaisieSchema = plageEnvoiSchema.safeExtend({
  tarifSmsMillimes: entierEntre(0, 10_000),
  devisDelaiJours: entierEntre(1, 60),
  devisRelancesMax: entierEntre(0, 5),
  finEssaiAvanceJours: entierEntre(1, 30),
  controleAvanceJours: entierEntre(1, 60),
  garantieAvanceJours: entierEntre(1, 180),
  renouvellementFenetreJours: entierEntre(1, 180),
});

export const scenarioSaisieSchema = z.object({
  actif: z.boolean(),
  canaux: z
    .array(z.enum(CANAUX_MESSAGE))
    .min(1, 'Choisir au moins un canal.')
    .refine((c) => new Set(c).size === c.length, 'Canal en double.'),
});

export interface ReglagesScenario {
  readonly actif: boolean;
  readonly canaux: readonly CanalMessage[];
}
