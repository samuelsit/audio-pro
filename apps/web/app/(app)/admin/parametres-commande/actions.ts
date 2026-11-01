'use server';

import { revalidatePath } from 'next/cache';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { enregistrerParametresCommande } from '@/server/services/fournisseurs';

export async function enregistrerParametresAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = {
    delaiRelanceJours: texte(formData, 'delaiRelanceJours'),
    relancesMax: texte(formData, 'relancesMax'),
    tolerancePrix: texte(formData, 'tolerancePrix'),
    adresseBoiteFactures: texte(formData, 'adresseBoiteFactures'),
  };
  const erreur = await executer(() => enregistrerParametresCommande(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/parametres-commande');
  await notifier('Paramètres enregistrés.');
  return {};
}
