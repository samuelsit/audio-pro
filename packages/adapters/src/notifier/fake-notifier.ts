import { appendFile } from 'node:fs/promises';

import {
  analyserSms,
  type CanalSuivi,
  type CourrierSortant,
  type EmailSortant,
  type EtatFournisseur,
  type Notifier,
  type RecuEnvoi,
  type SmsSortant,
} from '@ha/domain';

export type MessageSimule =
  | ({ readonly canal: 'SMS' } & SmsSortant)
  | ({ readonly canal: 'EMAIL' } & EmailSortant)
  | ({ readonly canal: 'COURRIER' } & CourrierSortant);

/** Le fichier garde le nom des pièces jointes, pas leurs octets. */
function sansContenu(message: MessageSimule): unknown {
  if (message.canal !== 'EMAIL' || message.piecesJointes === undefined) {
    return message;
  }
  return { ...message, piecesJointes: message.piecesJointes.map((p) => p.nomFichier) };
}

/**
 * Envois simulés : rien ne part. `envoyes` donne accès aux messages en test ; `fichier` (une ligne JSON par
 * message) les rend lisibles depuis un autre processus, pour le développement et les E2E. Sans autre consigne,
 * un message simulé est délivré.
 */
export class FakeNotifier implements Notifier {
  readonly envoyes: MessageSimule[] = [];
  /** État à rendre pour un identifiant donné. */
  readonly etats = new Map<string, EtatFournisseur>();
  /** Numéros qui ont répondu STOP. */
  oppositions: string[] = [];
  readonly #fichier: string | undefined;
  /** Simule une panne du fournisseur. */
  enPanne = false;

  constructor(fichier?: string) {
    this.#fichier = fichier;
  }

  async #enregistrer(message: MessageSimule): Promise<string> {
    if (this.enPanne) {
      throw new Error('Envoi simulé en échec.');
    }
    this.envoyes.push(message);
    if (this.#fichier !== undefined) {
      await appendFile(this.#fichier, `${JSON.stringify(sansContenu(message))}\n`);
    }
    return `simule-${String(this.envoyes.length)}`;
  }

  async envoyerSms(message: SmsSortant): Promise<RecuEnvoi> {
    const idFournisseur = await this.#enregistrer({ canal: 'SMS', ...message });
    return { idFournisseur, credits: analyserSms(message.texte).segments };
  }

  async envoyerEmail(message: EmailSortant): Promise<RecuEnvoi> {
    return {
      idFournisseur: await this.#enregistrer({ canal: 'EMAIL', ...message }),
      credits: null,
    };
  }

  async envoyerCourrier(message: CourrierSortant): Promise<RecuEnvoi> {
    await this.#enregistrer({ canal: 'COURRIER', ...message });
    return { idFournisseur: null, credits: null };
  }

  async etatEnvoi(_canal: CanalSuivi, idFournisseur: string): Promise<EtatFournisseur> {
    await Promise.resolve();
    if (this.enPanne) {
      throw new Error('Lecture simulée en échec.');
    }
    return this.etats.get(idFournisseur) ?? 'DELIVRE';
  }

  async oppositionsSms(): Promise<readonly string[]> {
    await Promise.resolve();
    return this.oppositions;
  }

  async retirerOppositionSms(numero: string): Promise<void> {
    await Promise.resolve();
    this.oppositions = this.oppositions.filter((n) => n !== numero);
  }
}
