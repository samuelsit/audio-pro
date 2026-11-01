import type { EmailSortant, EtatFournisseur, RecuEnvoi } from '@ha/domain';
import { z } from 'zod';

// Source : docs/vendor/scaleway-tem/README.md.
const API = 'https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails';
const ETATS_ECHEC = ['failed', 'canceled'];

const configurationSchema = z.object({
  SCW_TEM_SECRET_KEY: z.string().min(1),
  SCW_TEM_PROJECT_ID: z.string().min(1),
  SCW_TEM_EXPEDITEUR: z.email(),
  SCW_TEM_EXPEDITEUR_NOM: z.string().min(1),
  /** `actif` une fois vérifié que Scaleway admet ces en-têtes : la documentation ne le dit pas. */
  SCW_TEM_LIST_UNSUBSCRIBE: z.string().optional(),
});

export type ConfigurationScalewayEmail = z.output<typeof configurationSchema>;

/** Le message d'erreur nomme les variables manquantes, jamais leur valeur. */
export function chargerConfigurationScalewayEmail(
  env: Readonly<Record<string, string | undefined>>,
): ConfigurationScalewayEmail {
  const resultat = configurationSchema.safeParse(env);
  if (!resultat.success) {
    const variables = resultat.error.issues.map((i) => String(i.path[0])).join(', ');
    throw new Error(`Configuration Scaleway incomplète : ${variables}.`);
  }
  return resultat.data;
}

const reponseEnvoiSchema = z.object({ emails: z.array(z.object({ id: z.string() })).min(1) });
const envoiLuSchema = z.object({ status: z.string() });

function versHtml(texte: string): string {
  const echappe = texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<html><body><p>${echappe.replace(/\n/g, '<br>')}</p></body></html>`;
}

/**
 * Scaleway Transactional Email. L'expéditeur est celui du domaine vérifié ; le centre reçoit les réponses par
 * `Reply-To`. Aucune erreur ne cite une adresse ou un texte.
 */
export class ScalewayEmail {
  readonly #configuration: ConfigurationScalewayEmail;
  readonly #requeter: typeof fetch;

  constructor(configuration: ConfigurationScalewayEmail, requeter: typeof fetch = fetch) {
    this.#configuration = configuration;
    this.#requeter = requeter;
  }

  #enTetes(message: EmailSortant): { key: string; value: string }[] {
    const { repondreA, lienDesinscription } = message;
    return [
      ...(repondreA === undefined ? [] : [{ key: 'Reply-To', value: repondreA }]),
      ...(lienDesinscription !== undefined &&
      this.#configuration.SCW_TEM_LIST_UNSUBSCRIBE === 'actif'
        ? [
            { key: 'List-Unsubscribe', value: `<${lienDesinscription}>` },
            { key: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
          ]
        : []),
    ];
  }

  async envoyer(message: EmailSortant): Promise<RecuEnvoi> {
    const { SCW_TEM_SECRET_KEY, SCW_TEM_PROJECT_ID, SCW_TEM_EXPEDITEUR, SCW_TEM_EXPEDITEUR_NOM } =
      this.#configuration;
    const enTetes = this.#enTetes(message);
    const piecesJointes = message.piecesJointes ?? [];
    const reponse = await this.#requeter(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': SCW_TEM_SECRET_KEY },
      body: JSON.stringify({
        from: { email: SCW_TEM_EXPEDITEUR, name: SCW_TEM_EXPEDITEUR_NOM },
        to: [{ email: message.destinataire }],
        subject: message.sujet,
        text: message.texte,
        html: versHtml(message.texte),
        project_id: SCW_TEM_PROJECT_ID,
        ...(piecesJointes.length === 0
          ? {}
          : {
              attachments: piecesJointes.map((p) => ({
                name: p.nomFichier,
                type: p.typeContenu,
                content: Buffer.from(p.contenu).toString('base64'),
              })),
            }),
        ...(enTetes.length === 0 ? {} : { additional_headers: enTetes }),
      }),
    });
    if (!reponse.ok) {
      throw new Error(`Scaleway : envoi refusé (HTTP ${String(reponse.status)}).`);
    }
    const { emails } = reponseEnvoiSchema.parse(await reponse.json());
    return { idFournisseur: (emails[0] as { id: string }).id, credits: null };
  }

  async etat(idFournisseur: string): Promise<EtatFournisseur> {
    const reponse = await this.#requeter(`${API}/${encodeURIComponent(idFournisseur)}`, {
      headers: { 'X-Auth-Token': this.#configuration.SCW_TEM_SECRET_KEY },
    });
    if (!reponse.ok) {
      throw new Error(`Scaleway : lecture refusée (HTTP ${String(reponse.status)}).`);
    }
    const { status } = envoiLuSchema.parse(await reponse.json());
    if (status === 'sent') {
      return 'DELIVRE';
    }
    return ETATS_ECHEC.includes(status) ? 'ECHEC' : 'EN_COURS';
  }
}
