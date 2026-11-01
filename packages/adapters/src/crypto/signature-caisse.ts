import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

import type { SignatureCaisse } from '@ha/domain';

function publiqueDepuisBase64(base64: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
}

function exporterPublique(cle: KeyObject): string {
  return cle.export({ format: 'der', type: 'spki' }).toString('base64');
}

function identifiantCle(clePublique: string): string {
  return createHash('sha256').update(clePublique, 'base64').digest('hex').slice(0, 16);
}

/**
 * Ed25519 (ADR-029) : la clé privée vient de l'environnement, jamais de la base. Une rotation garde les clés
 * publiques précédentes, pour vérifier ce qui a déjà été signé.
 */
export class SignatureCaisseEd25519 implements SignatureCaisse {
  readonly cleId: string;
  readonly clePublique: string;
  private readonly privee: KeyObject;
  private readonly publiques: ReadonlyMap<string, KeyObject>;

  constructor(clePrivee: string, anciennesPubliques: readonly string[] = []) {
    this.privee = createPrivateKey({
      key: Buffer.from(clePrivee, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    if (this.privee.asymmetricKeyType !== 'ed25519') {
      throw new Error('La clé de signature de caisse doit être une clé Ed25519.');
    }
    const publique = createPublicKey(this.privee);
    this.clePublique = exporterPublique(publique);
    this.cleId = identifiantCle(this.clePublique);
    this.publiques = new Map([
      ...anciennesPubliques.map((c): [string, KeyObject] => [
        identifiantCle(c),
        publiqueDepuisBase64(c),
      ]),
      [this.cleId, publique],
    ]);
  }

  signer(message: string): string {
    return sign(null, Buffer.from(message, 'utf8'), this.privee).toString('base64');
  }

  verifier(message: string, signature: string, cleId: string): boolean {
    const publique = this.publiques.get(cleId);
    return (
      publique !== undefined &&
      verify(null, Buffer.from(message, 'utf8'), publique, Buffer.from(signature, 'base64'))
    );
  }
}

/** Sans clé : développement et tests seulement, voir `signatureCaisse` de `@ha/caisse`. */
export class FakeSignatureCaisse implements SignatureCaisse {
  readonly cleId = 'simulation';
  readonly clePublique = 'simulation';

  signer(message: string): string {
    return `simulation:${createHash('sha256').update(message, 'utf8').digest('hex')}`;
  }

  verifier(message: string, signature: string, cleId: string): boolean {
    return cleId === this.cleId && signature === this.signer(message);
  }
}

interface EnvSignatureCaisse {
  readonly CAISSE_SIGNATURE_CLE_PRIVEE?: string;
  readonly CAISSE_SIGNATURE_CLES_ANCIENNES?: string;
  readonly NODE_ENV?: string;
}

/** `CAISSE_SIGNATURE_CLE_PRIVEE` : PKCS#8 DER en base64. Obligatoire en production. */
export function chargerSignatureCaisse(env: EnvSignatureCaisse): SignatureCaisse {
  const clePrivee = env.CAISSE_SIGNATURE_CLE_PRIVEE;
  if (clePrivee) {
    const anciennes = env.CAISSE_SIGNATURE_CLES_ANCIENNES?.split(',').filter(Boolean) ?? [];
    return new SignatureCaisseEd25519(clePrivee, anciennes);
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('CAISSE_SIGNATURE_CLE_PRIVEE manquante.');
  }
  return new FakeSignatureCaisse();
}
