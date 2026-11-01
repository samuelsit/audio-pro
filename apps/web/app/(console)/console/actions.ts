'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { CHEMIN_CONSOLE } from '@/server/auth/constantes';
import { requireSuperadmin } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  creerOrganisation,
  reactiverOrganisation,
  suspendreOrganisation,
} from '@/server/services/organisations';
import { ajouterTauxTva } from '@/server/services/taux-tva';

export async function ajouterTauxTvaAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSuperadmin();
  const donnees = {
    type: texte(formData, 'type'),
    taux: texte(formData, 'taux'),
    debut: texte(formData, 'debut'),
  };
  const erreur = await executer(() => ajouterTauxTva(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(`${CHEMIN_CONSOLE}/tva`);
  return { succes: 'Taux enregistré.' };
}

function saisie(formData: FormData) {
  return {
    raisonSociale: texte(formData, 'raisonSociale'),
    siren: texte(formData, 'siren'),
    adresseLigne1: texte(formData, 'adresseLigne1'),
    adresseLigne2: texte(formData, 'adresseLigne2'),
    codePostal: texte(formData, 'codePostal'),
    ville: texte(formData, 'ville'),
    statut: texte(formData, 'statut'),
    adminPrenom: texte(formData, 'adminPrenom'),
    adminNom: texte(formData, 'adminNom'),
    adminEmail: texte(formData, 'adminEmail'),
  };
}

export async function creerOrganisationAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSuperadmin();
  const donnees = saisie(formData);
  const erreur = await executer(
    () => creerOrganisation(acteur, donnees, texte(formData, 'motDePasse')),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  revalidatePath(CHEMIN_CONSOLE);
  await notifier('Client créé.');
  redirect(CHEMIN_CONSOLE);
}

export async function suspendreOrganisationAction(organisationId: string): Promise<void> {
  const acteur = await requireSuperadmin();
  const change = await suspendreOrganisation(acteur, organisationId);
  revalidatePath(CHEMIN_CONSOLE);
  await notifier(change ? 'Client suspendu.' : 'Ce client était déjà suspendu.');
}

export async function reactiverOrganisationAction(
  organisationId: string,
  statut: 'ESSAI' | 'ACTIF',
): Promise<void> {
  const acteur = await requireSuperadmin();
  const change = await reactiverOrganisation(acteur, organisationId, statut);
  revalidatePath(CHEMIN_CONSOLE);
  await notifier(change ? 'Client réactivé.' : 'Ce client n’est plus suspendu : rien n’a changé.');
}
