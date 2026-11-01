'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireRole } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  importerReleve,
  previsualiserReleve,
  repointerReleve,
  type ApercuReleve,
} from '@/server/services/releves-centrale';

export interface EtatReleve extends EtatFormulaire {
  apercu?: ApercuReleve;
  csv?: string;
}

export async function previsualiserReleveAction(
  _: EtatReleve,
  formData: FormData,
): Promise<EtatReleve> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const centraleAchatId = texte(formData, 'centraleAchatId');
  const mois = texte(formData, 'mois');
  const fichier = formData.get('fichier');
  const csv = fichier instanceof File ? await fichier.text() : '';
  const valeurs = { centraleAchatId, mois };
  let apercu: ApercuReleve | undefined;
  const erreur = await executer(async () => {
    apercu = await previsualiserReleve(acteur, { centraleAchatId, mois, csv });
  }, valeurs);
  return erreur ?? { valeurs, csv, ...(apercu ? { apercu } : {}) };
}

export async function importerReleveAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const donnees = {
    centraleAchatId: texte(formData, 'centraleAchatId'),
    mois: texte(formData, 'mois'),
    csv: texte(formData, 'csv'),
  };
  const piece = formData.get('pdf');
  const pdf =
    piece instanceof File && piece.size > 0 ? new Uint8Array(await piece.arrayBuffer()) : null;
  let id = '';
  const erreur = await executer(async () => {
    id = await importerReleve(acteur, donnees, pdf);
  });
  if (erreur) {
    return erreur;
  }
  revalidatePath('/commandes/releves');
  await notifier('Relevé importé.');
  redirect(`/commandes/releves/${id}`);
}

export async function repointerReleveAction(releveId: string): Promise<void> {
  const acteur = await requireRole('ADMIN_CLIENT');
  const modifiees = await repointerReleve(acteur, releveId);
  await notifier(`Pointage refait : ${String(modifiees)} ligne(s) modifiée(s).`);
  revalidatePath(`/commandes/releves/${releveId}`);
}
