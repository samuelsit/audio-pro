'use server';

import type { StatutRdv } from '@ha/domain';
import { revalidatePath } from 'next/cache';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import {
  annulerRdv,
  changerStatutRdv,
  chercherCreneaux,
  creerRdv,
  deplacerRdv,
  lireRdv,
  marquerArrivee,
  modifierNotesRdv,
  prendreEnCharge,
  rechercherPatientsPourRdv,
  type CreneauPropose,
  type PatientPropose,
  type RdvDetail,
} from '@/server/services/agenda';
import { listerDossiersDuPatient } from '@/server/services/dossiers';

function terminer(etat: EtatFormulaire | null, succes: string): EtatFormulaire {
  if (etat) {
    return etat;
  }
  revalidatePath('/agenda', 'layout');
  return { succes };
}

export async function creerRdvAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    centreId: texte(formData, 'centreId'),
    typeRdvId: texte(formData, 'typeRdvId'),
    patientId: texte(formData, 'patientId'),
    prospectNom: texte(formData, 'prospectNom'),
    prospectTelephone: texte(formData, 'prospectTelephone'),
    dossierId: texte(formData, 'dossierId'),
    date: texte(formData, 'date'),
    heure: texte(formData, 'heure'),
    dureeMinutes: texte(formData, 'dureeMinutes'),
    praticienId: texte(formData, 'praticienId'),
    cabineId: texte(formData, 'cabineId'),
    origine: texte(formData, 'origine'),
    notes: texte(formData, 'notes'),
    confirmerHorsDisponibilites: coche(formData, 'confirmerHorsDisponibilites'),
  };
  return terminer(await executer(() => creerRdv(acteur, donnees), donnees), 'Rendez-vous créé.');
}

export interface SaisieDeplacement {
  version: number;
  date: string;
  heure: string;
  dureeMinutes: number;
  praticienId?: string | null;
  confirmerHorsDisponibilites?: boolean;
}

export async function deplacerRdvAction(
  id: string,
  saisie: SaisieDeplacement,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(await executer(() => deplacerRdv(acteur, id, saisie)), 'Rendez-vous déplacé.');
}

/** Ouvre le panneau d'un rendez-vous : le service écrit la ligne READ. */
export async function lireRdvAction(id: string): Promise<RdvDetail | null> {
  const acteur = await requireSession();
  try {
    return await lireRdv(acteur, id);
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError) {
      return null;
    }
    throw erreur;
  }
}

export async function changerStatutRdvAction(
  id: string,
  version: number,
  statut: StatutRdv,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(
    await executer(() => changerStatutRdv(acteur, id, { version, statut })),
    'Statut mis à jour.',
  );
}

export async function marquerArriveeAction(
  id: string,
  version: number,
  prospect?: unknown,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(
    await executer(() => marquerArrivee(acteur, id, { version, prospect })),
    'Arrivée enregistrée.',
  );
}

export async function prendreEnChargeAction(id: string, version: number): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(
    await executer(() => prendreEnCharge(acteur, id, version)),
    'Patient pris en charge.',
  );
}

export async function annulerRdvAction(id: string, version: number): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(await executer(() => annulerRdv(acteur, id, version)), 'Rendez-vous annulé.');
}

export async function modifierNotesRdvAction(
  id: string,
  version: number,
  notes: string,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(
    await executer(() => modifierNotesRdv(acteur, id, { version, notes })),
    'Notes enregistrées.',
  );
}

export async function chercherPatientsAction(terme: string): Promise<PatientPropose[]> {
  return rechercherPatientsPourRdv(await requireSession(), terme);
}

export async function dossiersDuPatientAction(
  patientId: string,
): Promise<{ id: string; libelle: string }[]> {
  const dossiers = await listerDossiersDuPatient(await requireSession(), patientId);
  return dossiers.map((d) => ({
    id: d.id,
    libelle: `Dossier du ${d.dateOuverture.split('-').reverse().join('/')}`,
  }));
}

export async function chercherCreneauxAction(saisie: unknown): Promise<CreneauPropose[]> {
  return chercherCreneaux(await requireSession(), saisie);
}
