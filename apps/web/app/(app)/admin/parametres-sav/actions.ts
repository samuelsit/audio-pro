'use server';

import { revalidatePath } from 'next/cache';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import { enregistrerParametresSav } from '@/server/services/garanties';

export async function enregistrerParametresAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = {
    dureeGarantieMois: texte(formData, 'dureeGarantieMois'),
    suiviMois: texte(formData, 'suiviMois'),
    suiviParAn: texte(formData, 'suiviParAn'),
    pretDureeJours: texte(formData, 'pretDureeJours'),
  };
  const erreur = await executer(() => enregistrerParametresSav(acteur, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/admin/parametres-sav');
  await notifier('Paramètres enregistrés.');
  return {};
}
