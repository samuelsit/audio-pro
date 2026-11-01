import { FakeBillingEngine } from '@ha/adapters';
import type { BillingEngine } from '@ha/domain';

function creerBillingEngine(): BillingEngine {
  if (process.env.BILLING_ENGINE === 'simulation' && process.env.NODE_ENV !== 'production') {
    return new FakeBillingEngine();
  }
  // À VÉRIFIER : AreaFSE arrive à l'étape 26, docs/vendor/areafse est vide.
  throw new Error('Aucun moteur de facturation n’est configuré.');
}

let instance: BillingEngine | undefined;

/** Facturation SESAM-Vitale : simulation hors production, en attendant AreaFSE (ADR-028). */
export function billingEngine(): BillingEngine {
  instance ??= creerBillingEngine();
  return instance;
}
