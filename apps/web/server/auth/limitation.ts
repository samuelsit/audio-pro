import { clientPlateforme } from '@ha/db';

export interface RegleLimitation {
  /** Nombre maximal de tentatives dans la fenêtre. */
  readonly max: number;
  readonly fenetreSecondes: number;
}

/** Tentatives de connexion : par adresse e-mail et par adresse IP. */
export const LIMITE_CONNEXION_EMAIL: RegleLimitation = { max: 10, fenetreSecondes: 15 * 60 };
export const LIMITE_CONNEXION_IP: RegleLimitation = { max: 30, fenetreSecondes: 15 * 60 };

/**
 * Enregistre une tentative pour `cle` et indique si elle reste sous la limite.
 * Fenêtre fixe, stockée dans la table `limitation_debit` (Better Auth ne limite que ses routes HTTP,
 * que nous n'exposons pas).
 */
export async function enregistrerTentative(
  cle: string,
  regle: RegleLimitation,
  maintenant: number = Date.now(),
): Promise<boolean> {
  const debutFenetre = BigInt(maintenant - regle.fenetreSecondes * 1000);
  const instant = BigInt(maintenant);
  // Une seule instruction : deux connexions simultanées ne perdent aucune tentative, et une réinitialisation
  // entre deux écritures ne fait pas échouer la connexion.
  const [ligne] = await clientPlateforme().$queryRaw<{ count: number }[]>`
    INSERT INTO limitation_debit (id, key, count, derniere_requete)
    VALUES (gen_random_uuid()::text, ${cle}, 1, ${instant}::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN limitation_debit.derniere_requete < ${debutFenetre}::bigint THEN 1
        ELSE limitation_debit.count + 1
      END,
      derniere_requete = CASE
        WHEN limitation_debit.derniere_requete < ${debutFenetre}::bigint THEN ${instant}::bigint
        ELSE limitation_debit.derniere_requete
      END
    RETURNING count`;
  return (ligne?.count ?? 0) <= regle.max;
}

/** Réinitialise un compteur (connexion réussie). */
export async function reinitialiserTentatives(cle: string): Promise<void> {
  await clientPlateforme().limitationDebit.deleteMany({ where: { key: cle } });
}
