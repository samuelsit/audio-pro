import type { Prisma } from '@ha/db';
import {
  MODELES_DEFAUT,
  PARAMETRES_COMMUNICATION_DEFAUT,
  type JourSemaine,
  type ParametresCommunication,
  type ScenarioCommunication,
  type TextesModele,
} from '@ha/domain';

type ClientLecture = Pick<Prisma.TransactionClient, 'parametresCommunication' | 'modeleMessage'>;

/** Réglages du client, ou les valeurs par défaut s'il n'en a pas enregistré. */
export async function lireParametresCommunication(
  client: ClientLecture,
  organisationId: string,
): Promise<ParametresCommunication> {
  const ligne = await client.parametresCommunication.findUnique({ where: { organisationId } });
  return ligne === null
    ? PARAMETRES_COMMUNICATION_DEFAUT
    : { ...ligne, jours: ligne.jours as JourSemaine[] };
}

export interface ModeleDuScenario {
  readonly textes: TextesModele;
  /** `null` pour le modèle par défaut, qui n'a pas de version enregistrée. */
  readonly version: number | null;
}

/** Texte de chaque scénario : celui du client, sinon le modèle neutre par défaut. */
export async function modelesDesScenarios(
  client: ClientLecture,
): Promise<(scenario: ScenarioCommunication) => ModeleDuScenario> {
  const lignes = await client.modeleMessage.findMany({ where: { scenario: { not: null } } });
  return (scenario) => {
    const ligne = lignes.find((l) => l.scenario === scenario);
    return ligne === undefined
      ? { textes: MODELES_DEFAUT[scenario], version: null }
      : { textes: ligne, version: ligne.version };
  };
}
