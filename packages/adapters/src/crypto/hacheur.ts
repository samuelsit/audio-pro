import { createHash } from 'node:crypto';

import type { Hacheur } from '@ha/domain';

/** Sans clé : la chaîne de caisse doit se vérifier sans secret. */
export class HacheurSha256 implements Hacheur {
  sha256(texte: string): string {
    return createHash('sha256').update(texte, 'utf8').digest('hex');
  }
}
