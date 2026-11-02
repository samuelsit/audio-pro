import { lireParametresCommunication } from '@ha/communication';
import {
  CANAUX_SCENARIO_DEFAUT,
  FINALITE_SCENARIO,
  MODELES_DEFAUT,
  modeleMessageSaisieSchema,
  parametresCommunicationSaisieSchema,
  peutParametrerCommunication,
  scenarioSaisieSchema,
  SCENARIOS_COMMUNICATION,
  type CanalMessage,
  type FinaliteMessage,
  type ParametresCommunication,
  type ScenarioCommunication,
  type TextesModele,
} from '@ha/domain';
import type { Prisma } from '@ha/db';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';

function exigerParametrage(acteur: UtilisateurConnecte): void {
  if (!peutParametrerCommunication(acteur.role)) {
    throw new AccesRefuseError();
  }
}

export function lireParametresDuClient(
  acteur: UtilisateurConnecte,
): Promise<ParametresCommunication> {
  return lireParametresCommunication(
    base(acteur) as unknown as Prisma.TransactionClient,
    acteur.organisationId,
  );
}

export async function enregistrerParametresCommunication(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  exigerParametrage(acteur);
  const donnees = valider(parametresCommunicationSaisieSchema, saisie);
  await withAudit(
    acteur,
    (tx) =>
      tx.parametresCommunication.upsert({
        where: { organisationId: acteur.organisationId },
        create: { ...donnees, organisationId: acteur.organisationId },
        update: donnees,
      }),
    ({ id }) => ({
      action: 'UPDATE',
      entiteType: 'PARAMETRES_COMMUNICATION',
      entiteId: id,
      details: { donnees },
    }),
  );
}

export interface ScenarioAffiche {
  readonly scenario: ScenarioCommunication;
  readonly finalite: FinaliteMessage;
  readonly actif: boolean;
  readonly canaux: readonly CanalMessage[];
  readonly textes: TextesModele;
  /** `null` : le modèle neutre par défaut s'applique. */
  readonly version: number | null;
}

export async function listerScenarios(acteur: UtilisateurConnecte): Promise<ScenarioAffiche[]> {
  exigerParametrage(acteur);
  const client = base(acteur);
  const [reglages, modeles] = await Promise.all([
    client.reglageScenario.findMany(),
    client.modeleMessage.findMany({ where: { scenario: { not: null } } }),
  ]);
  return SCENARIOS_COMMUNICATION.map((scenario) => {
    const reglage = reglages.find((r) => r.scenario === scenario);
    const modele = modeles.find((m) => m.scenario === scenario);
    return {
      scenario,
      finalite: FINALITE_SCENARIO[scenario],
      actif: reglage?.actif ?? false,
      canaux: reglage?.canaux ?? CANAUX_SCENARIO_DEFAUT,
      textes: modele ?? MODELES_DEFAUT[scenario],
      version: modele?.version ?? null,
    };
  });
}

export async function enregistrerScenario(
  acteur: UtilisateurConnecte,
  scenario: ScenarioCommunication,
  saisie: unknown,
): Promise<void> {
  exigerParametrage(acteur);
  const donnees = valider(scenarioSaisieSchema, saisie);
  await withAudit(
    acteur,
    (tx) =>
      tx.reglageScenario.upsert({
        where: { organisationId_scenario: { organisationId: acteur.organisationId, scenario } },
        create: { ...donnees, scenario, organisationId: acteur.organisationId },
        update: donnees,
      }),
    ({ id }) => ({
      action: 'UPDATE',
      entiteType: 'REGLAGE_SCENARIO',
      entiteId: id,
      details: { scenario, ...donnees },
    }),
  );
}

export interface ModeleCampagne {
  readonly id: string;
  readonly nom: string;
  readonly sujet: string;
  readonly version: number;
}

export async function listerModelesCampagne(
  acteur: UtilisateurConnecte,
): Promise<ModeleCampagne[]> {
  return base(acteur).modeleMessage.findMany({
    where: { scenario: null },
    select: { id: true, nom: true, sujet: true, version: true },
    orderBy: { nom: 'asc' },
  });
}

export async function obtenirModele(acteur: UtilisateurConnecte, id: string) {
  exigerParametrage(acteur);
  const modele = await base(acteur).modeleMessage.findFirst({
    where: { id, organisationId: acteur.organisationId },
  });
  if (modele === null) {
    throw new AccesRefuseError();
  }
  return modele;
}

/**
 * Crée ou remplace un modèle : le texte d'un scénario, ou un modèle de campagne. Chaque modification change la
 * version ; les messages déjà écrits gardent leur texte.
 */
export async function enregistrerModele(
  acteur: UtilisateurConnecte,
  id: string | null,
  saisie: unknown,
): Promise<string> {
  exigerParametrage(acteur);
  const { nom, scenario, sujet, corpsEmail, corpsSms, corpsCourrier } = valider(
    modeleMessageSaisieSchema,
    saisie,
  );
  const textes = { nom, sujet, corpsEmail, corpsSms, corpsCourrier };
  return withAudit(
    acteur,
    async (tx) => {
      const existant =
        id === null
          ? scenario === null
            ? null
            : await tx.modeleMessage.findFirst({ where: { scenario }, select: { id: true } })
          : await tx.modeleMessage.findFirst({ where: { id }, select: { id: true } });
      if (id !== null && existant === null) {
        throw new ErreurSaisie({}, 'Ce modèle n’existe plus.');
      }
      const { id: enregistre } =
        existant === null
          ? await tx.modeleMessage.create({
              data: { ...textes, scenario, organisationId: acteur.organisationId },
              select: { id: true },
            })
          : await tx.modeleMessage.update({
              where: { id: existant.id },
              data: { ...textes, version: { increment: 1 } },
              select: { id: true },
            });
      return enregistre;
    },
    (enregistre) => ({
      action: id === null ? 'CREATE' : 'UPDATE',
      entiteType: 'MODELE_MESSAGE',
      entiteId: enregistre,
      details: { nom, scenario },
    }),
  );
}
