'use server';

import { CHAMPS_FUSION } from '@ha/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { urlAvecParametres } from '@/lib/parametres';
import { executer } from '@/server/actions';
import { perimetreCourant, requireRole, requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  creerPatient,
  fusionnerPatients,
  modifierPatient,
  rechercherParNir,
} from '@/server/services/patients';

import { saisie } from './saisie';

export async function creerPatientAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisie(formData);
  // Bouton « Créer quand même » affiché avec les doublons possibles.
  const confirmerDoublon = coche(formData, 'confirmerDoublon');
  let id = '';
  const erreur = await executer(async () => {
    id = await creerPatient(acteur, donnees, { confirmerDoublon });
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/patients');
  await notifier('Fiche patient créée.');
  redirect(`/patients/${id}`);
}

export async function modifierPatientAction(
  patientId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierPatient(acteur, patientId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/patients');
  await notifier('Fiche patient enregistrée.');
  redirect(`/patients/${patientId}`);
}

/**
 * Recherche par NIR exact, en POST : le NIR ne figure jamais dans une URL (historique, journaux du
 * serveur). On redirige vers la fiche s'il n'y en a qu'une, sinon vers la liste filtrée par empreinte.
 */
export async function rechercherNirAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const { acteur, perimetre } = await perimetreCourant();
  let resultat: Awaited<ReturnType<typeof rechercherParNir>> | undefined;
  const erreur = await executer(async () => {
    resultat = await rechercherParNir(acteur, perimetre, { nir: texte(formData, 'nir') });
  });
  if (erreur || !resultat) {
    return { ...erreur, valeurs: { nir: texte(formData, 'nir') } };
  }
  redirect(
    resultat.patientId
      ? `/patients/${resultat.patientId}`
      : urlAvecParametres('/patients', { empreinte: resultat.empreinte }),
  );
}

export async function fusionnerPatientsAction(
  conserveeId: string,
  doublonId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT', 'RESPONSABLE_CENTRE', 'AUDIO');
  const choix = Object.fromEntries(
    CHAMPS_FUSION.flatMap((champ) => {
      const valeur = texte(formData, `choix.${champ}`);
      return valeur ? [[champ, valeur]] : [];
    }),
  );
  const erreur = await executer(() => fusionnerPatients(acteur, conserveeId, doublonId, choix));
  if (erreur) {
    return erreur;
  }
  revalidatePath('/patients');
  await notifier('Fiches fusionnées.');
  redirect(`/patients/${conserveeId}`);
}
