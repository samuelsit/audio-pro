'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { creerBrouillonsReappro, enregistrerSeuil, retirerSeuil } from '@/server/services/reappro';

const CHEMIN = '/commandes/reappro';

export async function enregistrerSeuilAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    produit: texte(formData, 'produit'),
    minimum: texte(formData, 'minimum'),
    cible: texte(formData, 'cible'),
  };
  const erreur = await executer(() => enregistrerSeuil(acteur, { ...donnees, centreId }), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(CHEMIN);
  return { succes: 'Seuil enregistré.' };
}

export async function retirerSeuilAction(centreId: string, seuilId: string): Promise<void> {
  const acteur = await requireSession();
  await retirerSeuil(acteur, centreId, seuilId);
  revalidatePath(CHEMIN);
}

export async function creerBrouillonsAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const quantites = liste(formData, 'quantite');
  const retenues = liste(formData, 'produit').map((produit, rang) => ({
    produit,
    quantite: quantites[rang] ?? '0',
  }));
  let commandes: string[] = [];
  const erreur = await executer(async () => {
    commandes = await creerBrouillonsReappro(acteur, centreId, retenues);
  });
  if (erreur) {
    return erreur;
  }
  revalidatePath('/commandes');
  await notifier(`${String(commandes.length)} demande(s) créée(s) en brouillon.`);
  redirect('/commandes?statut=BROUILLON');
}
