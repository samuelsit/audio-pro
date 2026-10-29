'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import { COOKIE_NOTIFICATION, type Notification } from '@/lib/notification';

function base64UrlVersTexte(valeur: string): string {
  const base64 = valeur.replace(/-/g, '+').replace(/_/g, '/');
  const octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(octets);
}

/** Lit puis efface la notification laissée par une server action avant sa redirection. */
function consommerNotification(): Notification | null {
  const brut = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE_NOTIFICATION}=`))
    ?.slice(COOKIE_NOTIFICATION.length + 1);
  if (!brut) {
    return null;
  }
  document.cookie = `${COOKIE_NOTIFICATION}=; Max-Age=0; Path=/`;
  try {
    const valeur: unknown = JSON.parse(base64UrlVersTexte(brut));
    if (
      typeof valeur === 'object' &&
      valeur !== null &&
      'message' in valeur &&
      typeof valeur.message === 'string'
    ) {
      return {
        message: valeur.message,
        type: 'type' in valeur && valeur.type === 'erreur' ? 'erreur' : 'succes',
      };
    }
  } catch {
    // Cookie illisible : ignoré.
  }
  return null;
}

/**
 * Zone des notifications (toasts). Les composants client appellent `toast()` de sonner directement ;
 * les server actions qui redirigent passent par `notifier()` (server/notifications.ts).
 */
export function Notifications() {
  const chemin = usePathname();
  useEffect(() => {
    const notification = consommerNotification();
    if (notification) {
      (notification.type === 'erreur' ? toast.error : toast.success)(notification.message);
    }
  }, [chemin]);
  return <Toaster position="top-right" closeButton />;
}
