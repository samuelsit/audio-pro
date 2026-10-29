'use server';

import { motDePasseSchema } from '@ha/domain';
import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { encode } from 'uqr';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { auth } from '@/server/auth/auth';
import { CHEMIN_CONNEXION } from '@/server/auth/constantes';
import { requireSession } from '@/server/auth/gardes';
import { marquerMotDePasseChange } from '@/server/services/compte';

export async function changerMotDePasse(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession({ etapesObligatoires: false });
  const actuel = texte(formData, 'motDePasseActuel');
  const nouveau = motDePasseSchema.safeParse(texte(formData, 'nouveauMotDePasse'));
  if (!nouveau.success) {
    return { erreurs: { nouveauMotDePasse: nouveau.error.issues.map((i) => i.message) } };
  }
  if (nouveau.data !== texte(formData, 'confirmation')) {
    return {
      erreurs: { confirmation: ['La confirmation ne correspond pas au nouveau mot de passe.'] },
    };
  }
  if (nouveau.data === actuel) {
    return {
      erreurs: { nouveauMotDePasse: ['Choisissez un mot de passe différent de l’actuel.'] },
    };
  }
  try {
    await auth().api.changePassword({
      body: { currentPassword: actuel, newPassword: nouveau.data, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (erreur) {
    if (erreur instanceof APIError) {
      return { erreurs: { motDePasseActuel: ['Mot de passe actuel incorrect.'] } };
    }
    throw erreur;
  }
  await marquerMotDePasseChange(acteur);
  redirect('/');
}

export interface EtatActivation extends EtatFormulaire {
  /** Chemin SVG des modules du QR code (carré de `tailleQr` modules). */
  qr?: { chemin: string; taille: number };
  secret?: string;
  codesSecours?: string[];
}

function cheminQr(texteQr: string): { chemin: string; taille: number } {
  const { data, size } = encode(texteQr, { border: 2 });
  const segments: string[] = [];
  data.forEach((ligne, y) =>
    ligne.forEach((noir, x) => {
      if (noir) {
        segments.push(`M${x} ${y}h1v1h-1z`);
      }
    }),
  );
  return { chemin: segments.join(''), taille: size };
}

/** Étape 1 de l'activation : mot de passe → nouveau secret TOTP (non vérifié) et codes de secours. */
export async function demarrerActivation(
  _: EtatActivation,
  formData: FormData,
): Promise<EtatActivation> {
  await requireSession({ etapesObligatoires: false });
  try {
    const resultat = await auth().api.enableTwoFactor({
      body: { password: texte(formData, 'motDePasse'), method: 'totp' },
      headers: await headers(),
    });
    if (resultat.method !== 'totp') {
      return { message: 'Activation impossible. Réessayez.' };
    }
    return {
      qr: cheminQr(resultat.totpURI),
      secret: new URL(resultat.totpURI).searchParams.get('secret') ?? '',
      codesSecours: resultat.backupCodes,
    };
  } catch (erreur) {
    if (erreur instanceof APIError) {
      return { erreurs: { motDePasse: ['Mot de passe incorrect.'] } };
    }
    throw erreur;
  }
}

/** Étape 2 : un premier code valide confirme l'activation. */
export async function confirmerActivation(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  await requireSession({ etapesObligatoires: false });
  const code = texte(formData, 'code').replace(/\s+/g, '');
  try {
    await auth().api.verifyTOTP({ body: { code }, headers: await headers() });
  } catch (erreur) {
    if (erreur instanceof APIError) {
      return {
        erreurs: { code: ['Code invalide. Vérifiez l’heure de votre téléphone et réessayez.'] },
      };
    }
    throw erreur;
  }
  redirect('/');
}

/** Désactivation (rôles pour lesquels la 2FA est facultative). */
export async function desactiverDeuxFacteurs(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  if (acteur.role === 'ADMIN') {
    return { message: 'La vérification en deux étapes est obligatoire pour un administrateur.' };
  }
  try {
    await auth().api.disableTwoFactor({
      body: { password: texte(formData, 'motDePasse') },
      headers: await headers(),
    });
  } catch (erreur) {
    if (erreur instanceof APIError) {
      return { erreurs: { motDePasse: ['Mot de passe incorrect.'] } };
    }
    throw erreur;
  }
  redirect('/compte/2fa');
}

export async function seDeconnecter(): Promise<void> {
  await auth().api.signOut({ headers: await headers() });
  redirect(CHEMIN_CONNEXION);
}
