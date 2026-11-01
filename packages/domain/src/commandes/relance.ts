const MS_PAR_JOUR = 86_400_000;

export interface EtatRelance {
  /** Dernier envoi réel, du bon ou d'une relance. Nul tant que rien n'est parti. */
  readonly dernierEnvoi: Date | null;
  readonly relances: number;
}

export interface ReglesRelance {
  readonly delaiJours: number;
  readonly relancesMax: number;
}

/** Sans accusé, relance une fois le délai écoulé depuis le dernier envoi réel. Choix de gestion (ADR-031). */
export function relanceDue(
  { dernierEnvoi, relances }: EtatRelance,
  { delaiJours, relancesMax }: ReglesRelance,
  maintenant: Date,
): boolean {
  return (
    dernierEnvoi !== null &&
    relances < relancesMax &&
    maintenant.getTime() - dernierEnvoi.getTime() >= delaiJours * MS_PAR_JOUR
  );
}
