import type {
  CanalSuivi,
  EmailSortant,
  EtatFournisseur,
  Notifier,
  RecuEnvoi,
  SmsSortant,
} from '@ha/domain';

import { FakeNotifier } from './fake-notifier';
import { chargerConfigurationOvhSms, OvhSms } from './ovh-sms';
import { chargerConfigurationScalewayEmail, ScalewayEmail } from './scaleway-email';

type Env = Readonly<Record<string, string | undefined>>;

/** Un fournisseur par canal. Sans prestataire postal, le lot reste à imprimer au centre. */
export class NotifierFournisseurs implements Notifier {
  readonly #sms: OvhSms;
  readonly #email: ScalewayEmail;

  constructor(sms: OvhSms, email: ScalewayEmail) {
    this.#sms = sms;
    this.#email = email;
  }

  envoyerSms(message: SmsSortant): Promise<RecuEnvoi> {
    return this.#sms.envoyer(message);
  }

  envoyerEmail(message: EmailSortant): Promise<RecuEnvoi> {
    return this.#email.envoyer(message);
  }

  envoyerCourrier(): Promise<RecuEnvoi> {
    return Promise.resolve({ idFournisseur: null, credits: null });
  }

  etatEnvoi(canal: CanalSuivi, idFournisseur: string): Promise<EtatFournisseur> {
    return canal === 'SMS' ? this.#sms.etat(idFournisseur) : this.#email.etat(idFournisseur);
  }

  oppositionsSms(): Promise<readonly string[]> {
    return this.#sms.oppositions();
  }

  retirerOppositionSms(numero: string): Promise<void> {
    return this.#sms.retirerOpposition(numero);
  }
}

/** Sans fournisseur, aucun message ne peut partir. La simulation n'existe pas en production. */
export function notifierActif(env: Env): boolean {
  return (
    env.NOTIFIER === 'reel' || (env.NOTIFIER === 'simulation' && env.NODE_ENV !== 'production')
  );
}

/** Même composition pour l'application et l'ouvrier. */
export function creerNotifierDepuisEnv(env: Env): Notifier {
  if (env.NOTIFIER === 'reel') {
    return new NotifierFournisseurs(
      new OvhSms(chargerConfigurationOvhSms(env)),
      new ScalewayEmail(chargerConfigurationScalewayEmail(env)),
    );
  }
  if (notifierActif(env)) {
    return new FakeNotifier(env.NOTIFIER_SIMULATION_FICHIER);
  }
  throw new Error('Aucun fournisseur de SMS ni d’e-mail n’est configuré.');
}
