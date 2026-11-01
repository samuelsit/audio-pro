import type { BoiteFactures, MessageFacture } from '@ha/domain';

/** Boîte simulée, par adresse. */
export class FakeBoiteFactures implements BoiteFactures {
  readonly #messages = new Map<string, MessageFacture[]>();

  deposer(adresse: string, message: MessageFacture): void {
    this.#messages.set(adresse, [...(this.#messages.get(adresse) ?? []), message]);
  }

  relever(adresse: string): Promise<readonly MessageFacture[]> {
    return Promise.resolve(this.#messages.get(adresse) ?? []);
  }

  acquitter(adresse: string, identifiant: string): Promise<void> {
    this.#messages.set(
      adresse,
      (this.#messages.get(adresse) ?? []).filter((m) => m.identifiant !== identifiant),
    );
    return Promise.resolve();
  }
}
