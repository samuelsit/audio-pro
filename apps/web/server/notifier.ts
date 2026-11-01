import { creerNotifierDepuisEnv, notifierActif } from '@ha/adapters';
import type { Notifier } from '@ha/domain';

/** Sans fournisseur, aucun message ne peut partir : documents et devis restent à remettre en main propre. */
export function notifierDisponible(): boolean {
  return notifierActif(process.env);
}

/**
 * Une page publique envoie un code SMS à la demande : en réel, elle exige son propre interrupteur, posé une fois
 * `PROXIES_DE_CONFIANCE` réglé (étape 23). Sans lui, la limitation par adresse IP se contourne.
 */
export function reservationPubliqueOuverte(): boolean {
  return (
    notifierDisponible() &&
    (process.env.NOTIFIER !== 'reel' || process.env.RESERVATION_PUBLIQUE === 'active')
  );
}

let instanceNotifier: Notifier | undefined;

/** Envois au patient : fournisseurs réels, ou simulation hors production. */
export function notifier(): Notifier {
  instanceNotifier ??= creerNotifierDepuisEnv(process.env);
  return instanceNotifier;
}
