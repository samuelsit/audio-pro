'use server';

import { revalidatePath } from 'next/cache';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { validerFacture } from '@/server/services/facturation';
import { confirmerCouvertureAmo, enregistrerPec } from '@/server/services/factures';

/** L'écran reste sur le dossier : la confirmation s'affiche dans le formulaire (voir ADR-011). */
function terminer(dossierId: string, succes: string): EtatFormulaire {
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath('/a-facturer');
  return { succes };
}

export async function validerFactureAction(
  dossierId: string,
  factureId: string,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => validerFacture(acteur, factureId));
  return erreur ?? terminer(dossierId, 'Facture validée.');
}

export async function confirmerCouvertureAction(dossierId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => confirmerCouvertureAmo(acteur, dossierId));
  return erreur ?? terminer(dossierId, 'Couverture AMO confirmée.');
}

export async function enregistrerPecAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    statut: texte(formData, 'statut'),
    organisme: texte(formData, 'organisme'),
    plateforme: texte(formData, 'plateforme'),
    numeroAccord: texte(formData, 'numeroAccord'),
    montantAccorde: texte(formData, 'montantAccorde'),
    datePec: texte(formData, 'datePec'),
  };
  const fichier = formData.get('justificatif');
  const justificatif =
    fichier instanceof File ? new Uint8Array(await fichier.arrayBuffer()) : new Uint8Array(0);
  const erreur = await executer(
    () => enregistrerPec(acteur, dossierId, donnees, justificatif),
    donnees,
  );
  return erreur ?? terminer(dossierId, 'Prise en charge enregistrée.');
}
