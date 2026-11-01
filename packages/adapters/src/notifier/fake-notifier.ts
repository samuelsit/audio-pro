import { appendFile } from 'node:fs/promises';

import type { EmailSortant, Notifier, SmsSortant } from '@ha/domain';

export type MessageSimule =
  ({ readonly canal: 'SMS' } & SmsSortant) | ({ readonly canal: 'EMAIL' } & EmailSortant);

/** Le fichier garde le nom des pièces jointes, pas leurs octets. */
function sansContenu(message: MessageSimule): unknown {
  if (message.canal === 'SMS' || message.piecesJointes === undefined) {
    return message;
  }
  return { ...message, piecesJointes: message.piecesJointes.map((p) => p.nomFichier) };
}

/**
 * Envois simulés : rien ne part. `envoyes` donne accès aux messages en test ; `fichier` (une ligne JSON par
 * message) les rend lisibles depuis un autre processus, pour le développement et les E2E.
 */
export class FakeNotifier implements Notifier {
  readonly envoyes: MessageSimule[] = [];
  readonly #fichier: string | undefined;
  /** Simule une panne du fournisseur. */
  enPanne = false;

  constructor(fichier?: string) {
    this.#fichier = fichier;
  }

  async #enregistrer(message: MessageSimule): Promise<void> {
    if (this.enPanne) {
      throw new Error('Envoi simulé en échec.');
    }
    this.envoyes.push(message);
    if (this.#fichier !== undefined) {
      await appendFile(this.#fichier, `${JSON.stringify(sansContenu(message))}\n`);
    }
  }

  async envoyerSms(message: SmsSortant): Promise<void> {
    await this.#enregistrer({ canal: 'SMS', ...message });
  }

  async envoyerEmail(message: EmailSortant): Promise<void> {
    await this.#enregistrer({ canal: 'EMAIL', ...message });
  }
}
