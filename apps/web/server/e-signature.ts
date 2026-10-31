import { FakeESignature } from '@ha/adapters';
import type { ESignature } from '@ha/domain';

/** Sans fournisseur, la signature à l'écran reste fermée : le dépôt du scan fait foi. */
export function signatureEcranDisponible(): boolean {
  return process.env.E_SIGNATURE === 'simulation' && process.env.NODE_ENV !== 'production';
}

function creerESignature(): ESignature {
  if (signatureEcranDisponible()) {
    return new FakeESignature();
  }
  // À VÉRIFIER : fournisseur à choisir et valeur probante, docs/vendor n'en documente aucun (ADR-025).
  throw new Error('Aucun fournisseur de signature électronique n’est configuré.');
}

let instanceESignature: ESignature | undefined;

/** Signature électronique : simulation hors production, tant qu'aucun fournisseur n'est retenu. */
export function eSignature(): ESignature {
  instanceESignature ??= creerESignature();
  return instanceESignature;
}
