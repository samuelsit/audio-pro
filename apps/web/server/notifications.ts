import { cookies } from 'next/headers';

import { COOKIE_NOTIFICATION, type Notification } from '@/lib/notification';

/**
 * Notification affichée après la redirection d'une server action (« Centre enregistré. »).
 * Message court et générique : jamais de donnée patient (le cookie est lisible par le navigateur).
 */
export async function notifier(
  message: string,
  type: Notification['type'] = 'succes',
): Promise<void> {
  const valeur = Buffer.from(JSON.stringify({ message, type } satisfies Notification)).toString(
    'base64url',
  );
  (await cookies()).set(COOKIE_NOTIFICATION, valeur, {
    path: '/',
    maxAge: 60,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
