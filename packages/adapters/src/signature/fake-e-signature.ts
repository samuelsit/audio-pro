import { createHash, randomUUID } from 'node:crypto';

import type { DemandeSignature, ESignature, PreuveSignature } from '@ha/domain';

/** Signature à l'écran simulée : aucune valeur probante, ni en développement ni en test. */
export class FakeESignature implements ESignature {
  readonly signatures: DemandeSignature[] = [];

  async signer(demande: DemandeSignature): Promise<PreuveSignature> {
    this.signatures.push(demande);
    return {
      fournisseur: 'simulation',
      reference: randomUUID(),
      empreinteDocument: demande.empreinteDocument,
      empreinteTrace: createHash('sha256').update(demande.trace).digest('hex'),
      horodatage: demande.horodatage,
    };
  }
}
