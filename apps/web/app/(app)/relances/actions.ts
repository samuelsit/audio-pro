'use server';

import { CANAUX_MESSAGE, gereLeCentre, instantSaisi, type CanalMessage } from '@ha/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { AccesRefuseError } from '@/server/auth/acces';
import { requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  annulerCampagne,
  compterSegment,
  creerCampagne,
  type ComptageSegment,
} from '@/server/services/campagnes';
import { genererComptesRendus, marquerLotImprime } from '@/server/services/courriers';

function segmentSaisi(formData: FormData) {
  return {
    centreIds: liste(formData, 'centreIds'),
    ageMin: texte(formData, 'ageMin') || null,
    ageMax: texte(formData, 'ageMax') || null,
    appareilleDepuis: texte(formData, 'appareilleDepuis') || null,
    appareilleJusquAu: texte(formData, 'appareilleJusquAu') || null,
    classes: liste(formData, 'classes'),
    statutsDossier: liste(formData, 'statutsDossier'),
  };
}

/** Le navigateur envoie une heure sans fuseau : c'est celle de Paris, pas celle du serveur. */
function instantProgramme(saisie: string): string | null {
  const [date = '', heure = ''] = saisie.split('T');
  const instant = saisie === '' ? null : instantSaisi(date, heure);
  return instant === null ? null : new Date(instant).toISOString();
}

function canalSaisi(formData: FormData): CanalMessage {
  const canal = texte(formData, 'canal');
  return CANAUX_MESSAGE.find((c) => c === canal) ?? 'SMS';
}

export interface ReponseComptage {
  readonly comptage?: ComptageSegment;
  readonly message?: string;
}

/** Hors du formulaire : compter ne doit pas réinitialiser la saisie. */
export async function compterSegmentAction(formData: FormData): Promise<ReponseComptage> {
  const acteur = await requireSession();
  let reponse: ReponseComptage = {};
  const erreur = await executer(async () => {
    reponse = {
      comptage: await compterSegment(acteur, segmentSaisi(formData), canalSaisi(formData)),
    };
  });
  return erreur ? { message: erreur.message ?? 'Critères invalides.' } : reponse;
}

export async function campagneAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  if (!gereLeCentre(acteur.role)) {
    throw new AccesRefuseError();
  }
  const saisie = {
    nom: texte(formData, 'nom'),
    modeleId: texte(formData, 'modeleId'),
    canal: canalSaisi(formData),
    segment: segmentSaisi(formData),
    programmeeLe: instantProgramme(texte(formData, 'programmeeLe')),
  };
  const erreur = await executer(() => creerCampagne(acteur, saisie), {
    nom: saisie.nom,
    modeleId: saisie.modeleId,
  });
  if (erreur) {
    return erreur;
  }
  await notifier('Campagne programmée.');
  redirect('/relances/campagnes');
}

export async function annulerCampagneAction(id: string): Promise<void> {
  const acteur = await requireSession();
  await annulerCampagne(acteur, id);
  revalidatePath('/relances/campagnes');
  await notifier('Campagne annulée.');
}

export async function marquerImprimeAction(id: string): Promise<void> {
  const acteur = await requireSession();
  await marquerLotImprime(acteur, id);
  revalidatePath('/relances/courriers');
  await notifier('Lot marqué imprimé.');
}

export async function comptesRendusAction(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const saisie = {
    centreId: texte(formData, 'centreId'),
    du: texte(formData, 'du'),
    au: texte(formData, 'au'),
  };
  const erreur = await executer(() => genererComptesRendus(acteur, saisie), saisie);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/relances/courriers');
  await notifier('Lot prêt à imprimer.');
  return {};
}
