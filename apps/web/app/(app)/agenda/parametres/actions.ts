'use server';

import { revalidatePath } from 'next/cache';

import { coche, liste, texte, type EtatFormulaire } from '@/lib/formulaire';
import { heuresSaisies, horaires } from '@/lib/horaires';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import {
  changerActivationCabine,
  changerActivationTypeRdv,
  creerCabine,
  creerException,
  creerTypeRdv,
  modifierHorairesPraticien,
  modifierTypeRdv,
  supprimerException,
} from '@/server/services/agenda-parametres';
import { enregistrerParametresReservation } from '@/server/services/reservation-parametres';

function terminer(erreur: EtatFormulaire | null, succes: string): EtatFormulaire {
  if (erreur) {
    return erreur;
  }
  revalidatePath('/agenda', 'layout');
  return { succes };
}

export async function creerCabineAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = { centreId, nom: texte(formData, 'nom') };
  return terminer(await executer(() => creerCabine(acteur, donnees), donnees), 'Cabine ajoutée.');
}

export async function changerActivationCabineAction(id: string, actif: boolean): Promise<void> {
  await changerActivationCabine(await requireSession(), id, actif);
  revalidatePath('/agenda', 'layout');
}

function champsType(formData: FormData) {
  return {
    nom: texte(formData, 'nom'),
    dureeMinutes: texte(formData, 'dureeMinutes'),
    couleur: texte(formData, 'couleur'),
    requierePraticien: coche(formData, 'requierePraticien'),
    requiereCabine: coche(formData, 'requiereCabine'),
    reservableEnLigne: coche(formData, 'reservableEnLigne'),
    delaiMinimalMinutes: texte(formData, 'delaiMinimalMinutes'),
    natureEssai: texte(formData, 'natureEssai'),
  };
}

export async function enregistrerTypeRdvAction(
  id: string | null,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = champsType(formData);
  return terminer(
    await executer(
      () => (id ? modifierTypeRdv(acteur, id, donnees) : creerTypeRdv(acteur, donnees)),
      donnees,
    ),
    'Type enregistré.',
  );
}

export async function changerActivationTypeRdvAction(id: string, actif: boolean): Promise<void> {
  await changerActivationTypeRdv(await requireSession(), id, actif);
  revalidatePath('/agenda', 'layout');
}

export async function modifierHorairesAction(
  praticienId: string,
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  return terminer(
    await executer(
      () => modifierHorairesPraticien(acteur, praticienId, centreId, horaires(formData)),
      heuresSaisies(formData),
    ),
    'Horaires enregistrés.',
  );
}

export async function creerExceptionAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    type: texte(formData, 'type'),
    praticienId: texte(formData, 'praticienId'),
    cabineId: texte(formData, 'cabineId'),
    centreId: texte(formData, 'centreCible'),
    du: texte(formData, 'du'),
    au: texte(formData, 'au'),
    heureDebut: texte(formData, 'heureDebut'),
    heureFin: texte(formData, 'heureFin'),
  };
  return terminer(
    await executer(() => creerException(acteur, centreId, donnees), donnees),
    'Exception ajoutée.',
  );
}

export async function supprimerExceptionAction(centreId: string, id: string): Promise<void> {
  await supprimerException(await requireSession(), centreId, id);
  revalidatePath('/agenda', 'layout');
}

export async function enregistrerReservationAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    actif: coche(formData, 'actif'),
    delaiMinimalMinutes: texte(formData, 'delaiMinimalMinutes'),
    horizonJours: texte(formData, 'horizonJours'),
    validation: texte(formData, 'validation'),
    delaiModificationHeures: texte(formData, 'delaiModificationHeures'),
    typeRdvIds: liste(formData, 'typeRdvIds'),
    slug: texte(formData, 'slug'),
  };
  return terminer(
    await executer(() => enregistrerParametresReservation(acteur, centreId, donnees), donnees),
    'Réservation en ligne enregistrée.',
  );
}
