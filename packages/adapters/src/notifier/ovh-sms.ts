import { createHash } from 'node:crypto';

import type { EtatFournisseur, RecuEnvoi, SmsSortant } from '@ha/domain';
import { z } from 'zod';

// Source : docs/vendor/ovh-sms/README.md.
const API = 'https://eu.api.ovh.com/1.0';
const PTT_DELIVRE = 4;
const PTT_ECHEC = [5, 8, 20, 23, 27, 28, 29];
const NON_TROUVE = 404;

const configurationSchema = z.object({
  OVH_SMS_APPLICATION_KEY: z.string().min(1),
  OVH_SMS_APPLICATION_SECRET: z.string().min(1),
  OVH_SMS_CONSUMER_KEY: z.string().min(1),
  OVH_SMS_SERVICE: z.string().min(1),
  OVH_SMS_EXPEDITEUR: z.string().min(1),
});

export type ConfigurationOvhSms = z.output<typeof configurationSchema>;

/** Le message d'erreur nomme les variables manquantes, jamais leur valeur. */
export function chargerConfigurationOvhSms(
  env: Readonly<Record<string, string | undefined>>,
): ConfigurationOvhSms {
  const resultat = configurationSchema.safeParse(env);
  if (!resultat.success) {
    const variables = resultat.error.issues.map((i) => String(i.path[0])).join(', ');
    throw new Error(`Configuration OVH SMS incomplète : ${variables}.`);
  }
  return resultat.data;
}

const reponseEnvoiSchema = z.object({
  ids: z.array(z.number()),
  invalidReceivers: z.array(z.string()),
  totalCreditsRemoved: z.number(),
});

const envoiLuSchema = z.object({
  ptt: z.number(),
  deliveredAt: z.string().nullish(),
});

export interface OptionsOvhSms {
  readonly requeter?: typeof fetch;
  readonly maintenantMs?: () => number;
}

/**
 * API SMS d'OVHcloud. La mention STOP est ajoutée par OVH : `noStopClause` n'est jamais levé, y compris sur un
 * rappel, car le patient doit pouvoir couper le canal (ADR-033). Aucune erreur ne cite un numéro ou un texte.
 */
export class OvhSms {
  readonly #configuration: ConfigurationOvhSms;
  readonly #requeter: typeof fetch;
  readonly #maintenantMs: () => number;
  #decalageSecondes: number | undefined;

  constructor(configuration: ConfigurationOvhSms, options: OptionsOvhSms = {}) {
    this.#configuration = configuration;
    this.#requeter = options.requeter ?? fetch;
    this.#maintenantMs = options.maintenantMs ?? Date.now;
  }

  /** La signature porte l'heure du serveur : l'écart est lu une fois, puis reporté. */
  async #horodatage(): Promise<number> {
    const local = Math.round(this.#maintenantMs() / 1000);
    if (this.#decalageSecondes === undefined) {
      const reponse = await this.#requeter(`${API}/auth/time`);
      if (!reponse.ok) {
        throw new Error(`OVH SMS : horloge indisponible (HTTP ${String(reponse.status)}).`);
      }
      this.#decalageSecondes = z.number().parse(await reponse.json()) - local;
    }
    return local + this.#decalageSecondes;
  }

  async #appeler(methode: string, chemin: string, corps?: unknown): Promise<Response> {
    const { OVH_SMS_APPLICATION_KEY, OVH_SMS_APPLICATION_SECRET, OVH_SMS_CONSUMER_KEY } =
      this.#configuration;
    const url = `${API}${chemin}`;
    const contenu = corps === undefined ? '' : JSON.stringify(corps);
    const horodatage = String(await this.#horodatage());
    const empreinte = createHash('sha1')
      .update(
        [OVH_SMS_APPLICATION_SECRET, OVH_SMS_CONSUMER_KEY, methode, url, contenu, horodatage].join(
          '+',
        ),
      )
      .digest('hex');
    return this.#requeter(url, {
      method: methode,
      headers: {
        'Content-Type': 'application/json',
        'X-Ovh-Application': OVH_SMS_APPLICATION_KEY,
        'X-Ovh-Consumer': OVH_SMS_CONSUMER_KEY,
        'X-Ovh-Timestamp': horodatage,
        'X-Ovh-Signature': `$1$${empreinte}`,
      },
      ...(contenu === '' ? {} : { body: contenu }),
    });
  }

  get #service(): string {
    return `/sms/${encodeURIComponent(this.#configuration.OVH_SMS_SERVICE)}`;
  }

  async envoyer({ destinataire, texte }: SmsSortant): Promise<RecuEnvoi> {
    const reponse = await this.#appeler('POST', `${this.#service}/jobs`, {
      message: texte,
      receivers: [destinataire],
      sender: this.#configuration.OVH_SMS_EXPEDITEUR,
      charset: 'UTF-8',
      noStopClause: false,
    });
    if (!reponse.ok) {
      throw new Error(`OVH SMS : envoi refusé (HTTP ${String(reponse.status)}).`);
    }
    const { ids, invalidReceivers, totalCreditsRemoved } = reponseEnvoiSchema.parse(
      await reponse.json(),
    );
    const id = ids[0];
    if (id === undefined || invalidReceivers.length > 0) {
      throw new Error('OVH SMS : destinataire refusé.');
    }
    return { idFournisseur: String(id), credits: totalCreditsRemoved };
  }

  /** Un envoi introuvable reste en cours : le relevé s'arrête de lui-même passé son délai. */
  async etat(idFournisseur: string): Promise<EtatFournisseur> {
    const reponse = await this.#appeler(
      'GET',
      `${this.#service}/outgoing/${encodeURIComponent(idFournisseur)}`,
    );
    if (reponse.status === NON_TROUVE) {
      return 'EN_COURS';
    }
    if (!reponse.ok) {
      throw new Error(`OVH SMS : lecture refusée (HTTP ${String(reponse.status)}).`);
    }
    const { ptt, deliveredAt } = envoiLuSchema.parse(await reponse.json());
    if (ptt === PTT_DELIVRE || (deliveredAt ?? null) !== null) {
      return 'DELIVRE';
    }
    return PTT_ECHEC.includes(ptt) ? 'ECHEC' : 'EN_COURS';
  }

  async oppositions(): Promise<readonly string[]> {
    const reponse = await this.#appeler('GET', `${this.#service}/blacklists`);
    if (!reponse.ok) {
      throw new Error(`OVH SMS : lecture des STOP refusée (HTTP ${String(reponse.status)}).`);
    }
    return z.array(z.string()).parse(await reponse.json());
  }

  /** Déjà retiré : sans effet. */
  async retirerOpposition(numero: string): Promise<void> {
    const reponse = await this.#appeler(
      'DELETE',
      `${this.#service}/blacklists/${encodeURIComponent(numero)}`,
    );
    if (!reponse.ok && reponse.status !== NON_TROUVE) {
      throw new Error(`OVH SMS : retrait du STOP refusé (HTTP ${String(reponse.status)}).`);
    }
  }
}
