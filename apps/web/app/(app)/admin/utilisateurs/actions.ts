'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  creerUtilisateur,
  modifierUtilisateur,
  reinitialiserMotDePasse,
} from '@/server/services/utilisateurs';

function saisie(formData: FormData) {
  return {
    prenom: texte(formData, 'prenom'),
    nom: texte(formData, 'nom'),
    email: texte(formData, 'email'),
    role: texte(formData, 'role'),
    centreIds: liste(formData, 'centreIds'),
    actif: coche(formData, 'actif'),
  };
}

export async function creerUtilisateurAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const donnees = saisie(formData);
  const erreur = await executer(
    () => creerUtilisateur(acteur, donnees, texte(formData, 'motDePasse')),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/utilisateurs');
  await notifier('Utilisateur enregistré.');
  redirect('/admin/utilisateurs');
}

export async function modifierUtilisateurAction(
  utilisateurId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const donnees = saisie(formData);
  const erreur = await executer(() => modifierUtilisateur(acteur, utilisateurId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/utilisateurs');
  await notifier('Utilisateur enregistré.');
  redirect('/admin/utilisateurs');
}

export async function reinitialiserMotDePasseAction(
  utilisateurId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN');
  const erreur = await executer(() =>
    reinitialiserMotDePasse(acteur, utilisateurId, texte(formData, 'motDePasse')),
  );
  return (
    erreur ?? {
      succes:
        'Mot de passe provisoire enregistré. Les sessions ouvertes de l’utilisateur ont été fermées.',
    }
  );
}
