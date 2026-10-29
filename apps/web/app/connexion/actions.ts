'use server';

import { emailSchema } from '@ha/domain';
import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { auth } from '@/server/auth/auth';
import {
  enregistrerTentative,
  LIMITE_CONNEXION_EMAIL,
  LIMITE_CONNEXION_IP,
  reinitialiserTentatives,
} from '@/server/auth/limitation';

const ECHEC_CONNEXION = 'E-mail ou mot de passe incorrect, ou compte désactivé.';

export async function seConnecter(_: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const email = emailSchema.safeParse(texte(formData, 'email'));
  const motDePasse = texte(formData, 'motDePasse');
  if (!email.success || motDePasse === '') {
    return { message: ECHEC_CONNEXION, valeurs: { email: texte(formData, 'email') } };
  }

  const entetes = await headers();
  const ip = entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue';
  const cleEmail = `connexion:email:${email.data}`;
  const sousLimiteEmail = await enregistrerTentative(cleEmail, LIMITE_CONNEXION_EMAIL);
  const sousLimiteIp = await enregistrerTentative(`connexion:ip:${ip}`, LIMITE_CONNEXION_IP);
  if (!sousLimiteEmail || !sousLimiteIp) {
    return { message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' };
  }

  let defiDeuxFacteurs = false;
  try {
    const resultat = await auth().api.signInEmail({
      body: { email: email.data, password: motDePasse },
      headers: entetes,
    });
    defiDeuxFacteurs = 'twoFactorRedirect' in resultat && resultat.twoFactorRedirect === true;
  } catch (erreur) {
    if (erreur instanceof APIError) {
      return { message: ECHEC_CONNEXION, valeurs: { email: email.data } };
    }
    throw erreur;
  }
  await reinitialiserTentatives(cleEmail);
  redirect(defiDeuxFacteurs ? '/connexion/2fa' : '/');
}

/** Second facteur à la connexion : code TOTP à 6 chiffres, ou code de secours. */
export async function verifierCodeConnexion(
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const code = texte(formData, 'code').replace(/\s+/g, '');
  const entetes = await headers();
  try {
    if (/^\d{6}$/.test(code)) {
      await auth().api.verifyTOTP({ body: { code, trustDevice: false }, headers: entetes });
    } else {
      await auth().api.verifyBackupCode({ body: { code }, headers: entetes });
    }
  } catch (erreur) {
    if (erreur instanceof APIError) {
      return { message: 'Code invalide ou expiré. Si le problème persiste, reconnectez-vous.' };
    }
    throw erreur;
  }
  redirect('/');
}
