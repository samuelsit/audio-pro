'use server';

import { revalidatePath } from 'next/cache';

import { liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { validerFacture } from '@/server/services/facturation';
import {
  actualiserPec,
  confirmerCouvertureAmo,
  demanderPecPlateforme,
  enregistrerPec,
} from '@/server/services/factures';

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
    complementaireId: texte(formData, 'complementaireId'),
    plateforme: texte(formData, 'plateforme'),
    numeroAdherent: texte(formData, 'numeroAdherent'),
    numeroAccord: texte(formData, 'numeroAccord'),
    montantAccorde: texte(formData, 'montantAccorde'),
    datePec: texte(formData, 'datePec'),
    validiteFin: texte(formData, 'validiteFin'),
    devisId: texte(formData, 'devisId'),
    offre: texte(formData, 'offre'),
  };
  const fichier = formData.get('justificatif');
  const justificatif =
    fichier instanceof File ? new Uint8Array(await fichier.arrayBuffer()) : new Uint8Array(0);
  const erreur = await executer(
    () =>
      enregistrerPec(
        acteur,
        dossierId,
        { ...donnees, demande: lignesDemande(formData) },
        justificatif,
      ),
    donnees,
  );
  return erreur ?? terminer(dossierId, 'Prise en charge enregistrée.');
}

function lignesDemande(formData: FormData) {
  const codes = liste(formData, 'demandeCodeLpp');
  const prix = liste(formData, 'demandePrix');
  const amo = liste(formData, 'demandeAmo');
  const montants = liste(formData, 'demandeMontant');
  return liste(formData, 'demandeLibelle').map((libelle, rang) => ({
    libelle,
    codeLpp: codes[rang],
    prixTtcCentimes: prix[rang],
    amoCentimes: amo[rang],
    montant: montants[rang] ?? '',
  }));
}

export async function demanderPecAction(dossierId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => demanderPecPlateforme(acteur, dossierId));
  return erreur ?? terminer(dossierId, 'Réponse de la plateforme enregistrée.');
}

export async function actualiserPecAction(dossierId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => actualiserPec(acteur, dossierId));
  return erreur ?? terminer(dossierId, 'Réponse de la plateforme actualisée.');
}
