'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  deposerFacture,
  modifierFactureFournisseur,
  rejeterFactureFournisseur,
  validerFactureFournisseur,
} from '@/server/services/factures-fournisseurs';

function actualiser(factureId: string): void {
  revalidatePath('/commandes/factures');
  revalidatePath(`/commandes/factures/${factureId}`);
  revalidatePath('/commandes/ecarts');
}

export async function deposerFactureAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const fichier = formData.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreurs: { fichier: ['Choisir un fichier PDF.'] } };
  }
  let id = '';
  const erreur = await executer(async () => {
    id = await deposerFacture(acteur, new Uint8Array(await fichier.arrayBuffer()));
  });
  if (erreur) {
    return erreur;
  }
  revalidatePath('/commandes/factures');
  redirect(`/commandes/factures/${id}`);
}

function lignesDe(formData: FormData) {
  const prix = liste(formData, 'ligne-prix');
  const quantites = liste(formData, 'ligne-quantite');
  const references = liste(formData, 'ligne-reference');
  const tva = liste(formData, 'ligne-tva');
  const numeros = liste(formData, 'ligne-numeros');
  const commandes = liste(formData, 'ligne-commande');
  return liste(formData, 'ligne-designation').map((designation, rang) => ({
    designation,
    quantite: quantites[rang],
    prixUnitaireCentimes: prix[rang],
    reference: references[rang],
    tauxTva: tva[rang],
    numerosSerie: numeros[rang],
    commandeLigneId: commandes[rang],
  }));
}

export async function modifierFactureAction(
  factureId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const entete = {
    fournisseurId: texte(formData, 'fournisseurId'),
    centreId: texte(formData, 'centreId'),
    numero: texte(formData, 'numero'),
    dateFacture: texte(formData, 'dateFacture'),
    montantHt: texte(formData, 'montantHt'),
    montantTva: texte(formData, 'montantTva'),
    montantTtc: texte(formData, 'montantTtc'),
  };
  const erreur = await executer(
    () => modifierFactureFournisseur(acteur, factureId, { ...entete, lignes: lignesDe(formData) }),
    entete,
  );
  if (erreur) {
    return erreur;
  }
  actualiser(factureId);
  return { succes: 'Facture enregistrée.' };
}

export async function validerFactureAction(factureId: string): Promise<void> {
  const acteur = await requireSession();
  let ecarts = 0;
  const erreur = await executer(async () => {
    ecarts = await validerFactureFournisseur(acteur, factureId);
  });
  if (erreur) {
    await notifier(erreur.message ?? 'Validation impossible.', 'erreur');
  } else {
    await notifier(
      ecarts > 0 ? `Facture validée, ${String(ecarts)} écart(s) à traiter.` : 'Facture validée.',
    );
  }
  actualiser(factureId);
}

export async function rejeterFactureAction(
  factureId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { motif: texte(formData, 'motif') };
  const erreur = await executer(
    () => rejeterFactureFournisseur(acteur, factureId, donnees),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  actualiser(factureId);
  return { succes: 'Facture rejetée.' };
}
