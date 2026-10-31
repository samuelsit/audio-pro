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
  const ligne = await clientPlateforme().$transaction(async (tx) => {
    const existante = await tx.limitationDebit.findUnique({ where: { key: cle } });
    if (!existante || existante.lastRequest < debutFenetre) {
      return tx.limitationDebit.upsert({
        where: { key: cle },
        create: { key: cle, count: 1, lastRequest: BigInt(maintenant) },
        update: { count: 1, lastRequest: BigInt(maintenant) },
      });
    }
    return tx.limitationDebit.update({
      where: { key: cle },
      data: { count: { increment: 1 } },
    });
  });
  return ligne.count <= regle.max;
}

/** Réinitialise un compteur (connexion réussie). */
export async function reinitialiserTentatives(cle: string): Promise<void> {
  await clientPlateforme().limitationDebit.deleteMany({ where: { key: cle } });
}
