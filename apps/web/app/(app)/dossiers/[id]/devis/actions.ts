'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  creerDevis,
  creerNouvelleVersion,
  demarrerEssai,
  deposerScanDevis,
  emettreDevis,
  enregistrerSignature,
  modifierDevis,
  supprimerBrouillon,
} from '@/server/services/devis';

function accesDossier(id: string): string {
  return `/dossiers/${id}`;
}

function accesDevis(dossierId: string, devisId: string): string {
  return `${accesDossier(dossierId)}/devis/${devisId}`;
}

/** Les offres arrivent en JSON : le schéma du domaine les valide, un texte illisible devient une erreur. */
function lireOffres(brut: string): unknown {
  try {
    return JSON.parse(brut) as unknown;
  } catch {
    return [];
  }
}

function saisie(formData: FormData) {
  return {
    lieuEmission: texte(formData, 'lieuEmission'),
    validiteMois: texte(formData, 'validiteMois'),
    tauxAmo: texte(formData, 'tauxAmo'),
    refusOffreC2S: coche(formData, 'refusOffreC2S'),
    contratResponsable: coche(formData, 'contratResponsable'),
    bobineTPresentee: coche(formData, 'bobineTPresentee'),
    ficheTechniqueJointe: coche(formData, 'ficheTechniqueJointe'),
    depotGarantie: texte(formData, 'depotGarantie'),
    datePrecedentDroite: texte(formData, 'datePrecedentDroite'),
    datePrecedentGauche: texte(formData, 'datePrecedentGauche'),
    offres: lireOffres(texte(formData, 'offres')),
    statutAttendu: texte(formData, 'statutAttendu'),
  };
}

async function terminer(dossierId: string, devisId: string, message: string): Promise<never> {
  revalidatePath(accesDossier(dossierId));
  revalidatePath(accesDevis(dossierId, devisId));
  await notifier(message);
  redirect(accesDevis(dossierId, devisId));
}

export async function creerDevisAction(
  dossierId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  let id = '';
  const erreur = await executer(async () => {
    id = await creerDevis(acteur, dossierId, saisie(formData));
  });
  return erreur ?? terminer(dossierId, id, 'Devis enregistré.');
}

export async function modifierDevisAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => modifierDevis(acteur, devisId, saisie(formData)));
  return erreur ?? terminer(dossierId, devisId, 'Devis enregistré.');
}

function statutAttendu(formData: FormData) {
  return { statutAttendu: texte(formData, 'statutAttendu') };
}

export async function emettreDevisAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => emettreDevis(acteur, devisId, statutAttendu(formData)));
  return erreur ?? terminer(dossierId, devisId, 'Devis émis.');
}

export async function nouvelleVersionAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  let id = '';
  const erreur = await executer(async () => {
    id = await creerNouvelleVersion(acteur, devisId, statutAttendu(formData));
  });
  return erreur ?? terminer(dossierId, id, 'Nouvelle version créée.');
}

export async function supprimerBrouillonAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const erreur = await executer(() => supprimerBrouillon(acteur, devisId, statutAttendu(formData)));
  if (erreur) {
    return erreur;
  }
  revalidatePath(accesDossier(dossierId));
  await notifier('Brouillon supprimé.');
  redirect(accesDossier(dossierId));
}

export async function demarrerEssaiAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { ...statutAttendu(formData), offreEssai: texte(formData, 'offreEssai') };
  const erreur = await executer(() => demarrerEssai(acteur, devisId, donnees), donnees);
  return erreur ?? terminer(dossierId, devisId, 'Essai démarré.');
}

export async function deposerScanAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const fichier = formData.get('scan');
  const scan =
    fichier instanceof File ? new Uint8Array(await fichier.arrayBuffer()) : new Uint8Array(0);
  const erreur = await executer(() =>
    deposerScanDevis(acteur, devisId, statutAttendu(formData), scan),
  );
  return erreur ?? terminer(dossierId, devisId, 'Devis signé déposé.');
}

export async function enregistrerSignatureAction(
  dossierId: string,
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    ...statutAttendu(formData),
    offreRetenue: texte(formData, 'offreRetenue'),
    dateSignature: texte(formData, 'dateSignature'),
    signe: coche(formData, 'signe'),
  };
  const erreur = await executer(() => enregistrerSignature(acteur, devisId, donnees), donnees);
  return erreur ?? terminer(dossierId, devisId, 'Signature enregistrée.');
}
