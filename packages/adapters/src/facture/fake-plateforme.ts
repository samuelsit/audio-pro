import type { FactureElectronique, PlateformeFactures } from '@ha/domain';

/** Plateforme simulée : aucun adaptateur réel tant que le choix n'est pas fait avec l'expert-comptable. */
export class FakePlateformeFactures implements PlateformeFactures {
  #factures: readonly FactureElectronique[] = [];

  deposer(facture: FactureElectronique): void {
    this.#factures = [...this.#factures, facture];
  }

  relever(): Promise<readonly FactureElectronique[]> {
    return Promise.resolve(this.#factures);
  }

  acquitter(identifiant: string): Promise<void> {
    this.#factures = this.#factures.filter((f) => f.identifiant !== identifiant);
    return Promise.resolve();
  }
}
