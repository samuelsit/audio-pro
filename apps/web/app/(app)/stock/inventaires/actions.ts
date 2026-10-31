'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  cloturerInventaire,
  compterAccessoire,
  justifierEcart,
  ouvrirInventaire,
  pointerAppareil,
} from '@/server/services/inventaires';

const LISTE = '/stock/inventaires';
const fiche = (id: string) => `${LISTE}/${id}`;

export async function ouvrirInventaireAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { centreId: texte(formData, 'centreId') };
  let id = '';
  const erreur = await executer(async () => {
    id = await ouvrirInventaire(acteur, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(LISTE);
  redirect(fiche(id));
}

export async function pointerAppareilAction(
  inventaireId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { numeroSerie: texte(formData, 'numeroSerie') };
  let resultat = '';
  const erreur = await executer(async () => {
    resultat = await pointerAppareil(acteur, inventaireId, donnees);
  }, donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(fiche(inventaireId));
  return {
    succes:
      resultat === 'ATTENDU'
        ? `${donnees.numeroSerie} : pointé.`
        : `${donnees.numeroSerie} : pointé, non attendu dans ce centre.`,
  };
}

export async function compterAccessoireAction(
  inventaireId: string,
  accessoireId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { accessoireId, quantiteComptee: texte(formData, 'quantiteComptee') };
  const erreur = await executer(() => compterAccessoire(acteur, inventaireId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(fiche(inventaireId));
  return {};
}

export async function justifierEcartAction(
  inventaireId: string,
  cible: { numeroSerie: string } | { accessoireId: string },
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { ...cible, justification: texte(formData, 'justification') };
  const erreur = await executer(() => justifierEcart(acteur, inventaireId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(fiche(inventaireId));
  return {};
}

export async function cloturerInventaireAction(inventaireId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => cloturerInventaire(acteur, inventaireId));
  if (erreur) {
    return erreur;
  }
  revalidatePath(LISTE);
  await notifier('Inventaire clôturé.');
  redirect(fiche(inventaireId));
}
