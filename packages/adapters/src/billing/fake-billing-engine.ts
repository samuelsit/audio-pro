import type { BillingEngine, FseDraft, ResultatFse, StatutFse } from '@ha/domain';

const SUIVANT: Readonly<Partial<Record<StatutFse, StatutFse>>> = {
  EN_ATTENTE: 'TRANSMISE',
  TRANSMISE: 'ACCEPTEE',
};

/**
 * Facturation simulée : rien ne part vers l'Assurance Maladie. Une FSE déposée est `EN_ATTENTE`, puis
 * chaque consultation la fait avancer jusqu'à `ACCEPTEE`. Sans RPPS du prescripteur, elle est rejetée d'emblée.
 * `prochainRejet` force un rejet avec motif à la prochaine consultation ou au prochain dépôt.
 * Le suivi vit en mémoire : après un redémarrage, une référence inconnue repart d'`EN_ATTENTE`.
 */
export class FakeBillingEngine implements BillingEngine {
  readonly recues: FseDraft[] = [];
  readonly #statuts = new Map<string, ResultatFse>();
  /** Motif du prochain rejet simulé, jamais de donnée du patient. */
  prochainRejet: string | null = null;

  #enregistrer(reference: string, statut: StatutFse, motif: string | null): ResultatFse {
    const resultat = { reference, statut, motif };
    this.#statuts.set(reference, resultat);
    return resultat;
  }

  #rejetForce(reference: string): ResultatFse | null {
    const motif = this.prochainRejet;
    this.prochainRejet = null;
    return motif === null ? null : this.#enregistrer(reference, 'REJETEE', motif);
  }

  soumettre(draft: FseDraft): Promise<ResultatFse> {
    this.recues.push(draft);
    const reference = `SIM-${draft.factureId}-${String(this.recues.length)}`;
    const sansRpps = draft.prescripteur.rpps === null;
    return Promise.resolve(
      this.#rejetForce(reference) ??
        (sansRpps
          ? this.#enregistrer(reference, 'REJETEE', 'RPPS du prescripteur absent (simulation).')
          : this.#enregistrer(reference, 'EN_ATTENTE', null)),
    );
  }

  consulter(reference: string): Promise<ResultatFse> {
    const actuel = this.#statuts.get(reference) ?? {
      reference,
      statut: 'EN_ATTENTE' as const,
      motif: null,
    };
    const suivant = SUIVANT[actuel.statut];
    if (suivant === undefined) {
      return Promise.resolve(actuel);
    }
    return Promise.resolve(
      this.#rejetForce(reference) ?? this.#enregistrer(reference, suivant, null),
    );
  }
}
