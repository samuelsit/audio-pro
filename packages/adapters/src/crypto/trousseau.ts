import { z } from 'zod';

import { ErreurConfigurationChiffrement } from './chiffreur';

/** Clés AES-256 indexées par identifiant ; `idActif` chiffre les nouvelles valeurs. */
export interface Trousseau {
  readonly cles: ReadonlyMap<string, Buffer>;
  readonly idActif: string;
}

// L'identifiant est stocké dans chaque enveloppe : pas de point (séparateur de l'enveloppe).
const ID_CLE = /^[A-Za-z0-9_-]{1,32}$/;
// 32 octets en base64 standard : 43 caractères puis « = ».
const CLE_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

const envSchema = z.object({
  CHIFFREMENT_CLES: z
    .string({ error: 'CHIFFREMENT_CLES n’est pas défini (voir .env.example).' })
    .trim()
    .min(1, 'CHIFFREMENT_CLES est vide (voir .env.example).'),
  CHIFFREMENT_CLE_ACTIVE: z
    .string({ error: 'CHIFFREMENT_CLE_ACTIVE n’est pas défini (voir .env.example).' })
    .trim()
    .min(1, 'CHIFFREMENT_CLE_ACTIVE est vide (voir .env.example).'),
});

/**
 * Lit le trousseau depuis l'environnement :
 * `CHIFFREMENT_CLES="k2026a:<base64>,k2026b:<base64>"` et `CHIFFREMENT_CLE_ACTIVE="k2026b"`.
 * Les messages d'erreur ne citent jamais une clé, seulement sa position ou son identifiant.
 */
export function chargerTrousseau(env: Readonly<Record<string, string | undefined>>): Trousseau {
  const resultat = envSchema.safeParse(env);
  if (!resultat.success) {
    throw new ErreurConfigurationChiffrement(resultat.error.issues[0]?.message ?? '');
  }
  const { CHIFFREMENT_CLES, CHIFFREMENT_CLE_ACTIVE } = resultat.data;

  const cles = new Map<string, Buffer>();
  CHIFFREMENT_CLES.split(',').forEach((entree, index) => {
    const [id = '', base64 = '', ...reste] = entree.trim().split(':');
    if (!ID_CLE.test(id) || !CLE_BASE64.test(base64) || reste.length > 0) {
      throw new ErreurConfigurationChiffrement(
        `Entrée n° ${index + 1} de CHIFFREMENT_CLES invalide : format attendu <identifiant>:<clé de 32 octets en base64>.`,
      );
    }
    if (cles.has(id)) {
      throw new ErreurConfigurationChiffrement(`Identifiant de clé en double : « ${id} ».`);
    }
    cles.set(id, Buffer.from(base64, 'base64'));
  });

  if (!cles.has(CHIFFREMENT_CLE_ACTIVE)) {
    throw new ErreurConfigurationChiffrement(
      `CHIFFREMENT_CLE_ACTIVE (« ${CHIFFREMENT_CLE_ACTIVE} ») ne correspond à aucune clé de CHIFFREMENT_CLES.`,
    );
  }
  return { cles, idActif: CHIFFREMENT_CLE_ACTIVE };
}
