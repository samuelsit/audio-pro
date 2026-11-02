'use server';

import { JOURS_SEMAINE, SCENARIOS_COMMUNICATION, type ScenarioCommunication } from '@ha/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  enregistrerModele,
  enregistrerParametresCommunication,
  enregistrerScenario,
  listerScenarios,
} from '@/server/services/communication';

export async function enregistrerParametresAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const valeurs = {
    heureDebut: texte(formData, 'heureDebut'),
    heureFin: texte(formData, 'heureFin'),
    tarifSmsMillimes: texte(formData, 'tarifSmsMillimes'),
    devisDelaiJours: texte(formData, 'devisDelaiJours'),
    devisRelancesMax: texte(formData, 'devisRelancesMax'),
    finEssaiAvanceJours: texte(formData, 'finEssaiAvanceJours'),
    controleAvanceJours: texte(formData, 'controleAvanceJours'),
    garantieAvanceJours: texte(formData, 'garantieAvanceJours'),
    renouvellementFenetreJours: texte(formData, 'renouvellementFenetreJours'),
  };
  const saisie = {
    ...valeurs,
    jours: JOURS_SEMAINE.filter((jour) => coche(formData, jour)),
    feries: coche(formData, 'feries'),
  };
  const erreur = await executer(() => enregistrerParametresCommunication(acteur, saisie), valeurs);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/communication');
  await notifier('Paramètres enregistrés.');
  return {};
}

export async function basculerScenarioAction(scenario: ScenarioCommunication): Promise<void> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const scenarios = await listerScenarios(acteur);
  const actuel = scenarios.find((s) => s.scenario === scenario);
  await enregistrerScenario(acteur, scenario, {
    actif: !actuel?.actif,
    canaux: actuel?.canaux,
  });
  revalidatePath('/admin/communication');
  await notifier(actuel?.actif ? 'Scénario désactivé.' : 'Scénario activé.');
}

export async function enregistrerModeleAction(
  id: string | null,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const scenario = SCENARIOS_COMMUNICATION.find((s) => s === texte(formData, 'scenario')) ?? null;
  const saisie = {
    nom: texte(formData, 'nom'),
    sujet: texte(formData, 'sujet'),
    corpsEmail: texte(formData, 'corpsEmail'),
    corpsSms: texte(formData, 'corpsSms'),
    corpsCourrier: texte(formData, 'corpsCourrier'),
  };
  const erreur = await executer(
    () => enregistrerModele(acteur, id, { ...saisie, scenario }),
    saisie,
  );
  if (erreur) {
    return erreur;
  }
  await notifier('Modèle enregistré.');
  redirect('/admin/communication');
}
