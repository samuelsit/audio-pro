'use server';

import { JOURS_SEMAINE, PLAGES_PAR_JOUR, type HorairesOuverture } from '@ha/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { creerCentre, modifierCentre } from '@/server/services/centres';

/** Plages renseignées de la grille des horaires ; une plage incomplète est refusée par le domaine. */
function horaires(formData: FormData) {
  const plages = (jour: keyof HorairesOuverture) =>
    Array.from({ length: PLAGES_PAR_JOUR }, (_, i) => ({
      debut: texte(formData, `${jour}-${i}-debut`),
      fin: texte(formData, `${jour}-${i}-fin`),
    })).filter((plage) => plage.debut !== '' || plage.fin !== '');
  return Object.fromEntries(JOURS_SEMAINE.map((jour) => [jour, plages(jour)]));
}

/** Heures saisies, pour les réafficher si le formulaire est refusé. */
function heuresSaisies(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].flatMap(([nom, valeur]) =>
      /-(debut|fin)$/.test(nom) && typeof valeur === 'string' ? [[nom, valeur]] : [],
    ),
  );
}

function champs(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    adresseLigne1: texte(formData, 'adresseLigne1'),
    adresseLigne2: texte(formData, 'adresseLigne2'),
    codePostal: texte(formData, 'codePostal'),
    ville: texte(formData, 'ville'),
    finess: texte(formData, 'finess'),
    numeroFacturationAm: texte(formData, 'numeroFacturationAm'),
    raisonSociale: texte(formData, 'raisonSociale'),
    siret: texte(formData, 'siret'),
    rcs: texte(formData, 'rcs'),
    tvaIntracommunautaire: texte(formData, 'tvaIntracommunautaire'),
    email: texte(formData, 'email'),
    telephone: texte(formData, 'telephone'),
    actif: coche(formData, 'actif'),
  };
}

function saisie(formData: FormData) {
  return { ...champs(formData), horairesOuverture: horaires(formData) };
}

function valeurs(formData: FormData) {
  return { ...champs(formData), ...heuresSaisies(formData) };
}

export async function creerCentreAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => creerCentre(acteur, donnees), valeurs(formData));
  if (erreur) {
    return erreur;
  }
  revalidatePath('/', 'layout');
  await notifier('Centre enregistré.');
  redirect('/admin/centres');
}

export async function modifierCentreAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierCentre(acteur, centreId, donnees), valeurs(formData));
  if (erreur) {
    return erreur;
  }
  revalidatePath('/', 'layout');
  await notifier('Centre enregistré.');
  redirect('/admin/centres');
}
