'use server';

import { decoderSimulation, encoderSimulation } from '@ha/adapters';
import { CHAMPS_CARTE, LIBELLES_ERREUR_VITALE } from '@ha/domain';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { urlAvecParametres } from '@/lib/parametres';
import { executer } from '@/server/actions';
import { perimetreCourant, requireSession } from '@/server/auth/gardes';
import { notifier } from '@/server/notifications';
import {
  appliquerCarteAuPatient,
  creerPatientDepuisCarte,
  lireCarte,
} from '@/server/services/vitale';
import { COOKIE_LECTURE_VITALE, DUREE_LECTURE_SECONDES } from '@/server/vitale/jeton';
import {
  COOKIE_SIMULATION_VITALE,
  lecteurVitale,
  simulationVitaleActive,
} from '@/server/vitale/lecteur';

import { saisie } from '../saisie';

const CHEMIN = '/patients/vitale';

// Lecture en cours : jeton chiffré, jamais lisible par le JavaScript de la page, envoyé seulement aux
// écrans de la lecture Vitale (ADR-007).
const COOKIE_LECTURE = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: CHEMIN,
} as const;

async function jetonLecture(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_LECTURE_VITALE)?.value;
}

async function effacerLecture(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_LECTURE_VITALE, path: CHEMIN });
}

/** Lit la carte (lecture historisée) et ouvre l'écran de choix du bénéficiaire. */
export async function lireCarteAction(patientOrigine: string | null): Promise<EtatFormulaire> {
  const { acteur, perimetre } = await perimetreCourant();
  const magasin = await cookies();
  const lecteur = lecteurVitale(magasin.get(COOKIE_SIMULATION_VITALE)?.value);
  const resultat = await lireCarte(acteur, perimetre, lecteur);
  if (!resultat.ok) {
    return { message: LIBELLES_ERREUR_VITALE[resultat.code] };
  }
  magasin.set(COOKIE_LECTURE_VITALE, resultat.jeton, {
    ...COOKIE_LECTURE,
    maxAge: DUREE_LECTURE_SECONDES,
  });
  redirect(urlAvecParametres(CHEMIN, patientOrigine ? { patient: patientOrigine } : {}));
}

/** Développement : choisit la carte « insérée » dans le lecteur simulé. */
export async function choisirCarteSimuleeAction(formData: FormData): Promise<void> {
  await requireSession();
  if (!simulationVitaleActive()) {
    return;
  }
  const simulation = decoderSimulation(texte(formData, 'simulation'));
  (await cookies()).set(COOKIE_SIMULATION_VITALE, encoderSimulation(simulation), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
  revalidatePath('/patients', 'layout');
}

/** Applique à la fiche les champs pour lesquels l'utilisateur a choisi la valeur de la carte. */
export async function appliquerCarteAction(
  index: string,
  patientId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const jeton = await jetonLecture();
  const acceptes = CHAMPS_CARTE.filter((champ) => texte(formData, `choix.${champ}`) === 'carte');
  const erreur = await executer(() =>
    appliquerCarteAuPatient(acteur, jeton, index, patientId, acceptes),
  );
  if (erreur) {
    return erreur;
  }
  await effacerLecture();
  revalidatePath('/patients');
  await notifier('Fiche mise à jour depuis la carte Vitale.');
  redirect(`/patients/${patientId}`);
}

/** Crée la fiche depuis le formulaire pré-rempli par la carte. */
export async function creerDepuisCarteAction(
  index: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const jeton = await jetonLecture();
  const donnees = saisie(formData);
  const confirmerDoublon = coche(formData, 'confirmerDoublon');
  let id = '';
  const erreur = await executer(async () => {
    id = await creerPatientDepuisCarte(acteur, jeton, index, donnees, { confirmerDoublon });
  }, donnees);
  if (erreur) {
    return erreur;
  }
  await effacerLecture();
  revalidatePath('/patients');
  await notifier('Fiche patient créée depuis la carte Vitale.');
  redirect(`/patients/${id}`);
}

/** Abandonne la lecture en cours : le résultat de la carte est effacé du navigateur. */
export async function terminerLectureAction(): Promise<void> {
  await requireSession();
  await effacerLecture();
  redirect('/patients');
}
