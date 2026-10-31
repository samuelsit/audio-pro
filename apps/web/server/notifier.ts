import { FakeNotifier } from '@ha/adapters';
import type { Notifier } from '@ha/domain';

function creerNotifier(): Notifier {
  if (process.env.NOTIFIER === 'simulation' && process.env.NODE_ENV !== 'production') {
    return new FakeNotifier(process.env.NOTIFIER_SIMULATION_FICHIER);
  }
  // À VÉRIFIER : fournisseur SMS et e-mail à choisir, docs/vendor n'en documente aucun (ADR-021).
  throw new Error('Aucun fournisseur de SMS ni d’e-mail n’est configuré.');
}

let instanceNotifier: Notifier | undefined;

/** Envois au patient : simulation hors production, tant qu'aucun fournisseur n'est retenu. */
export function notifier(): Notifier {
  instanceNotifier ??= creerNotifier();
  return instanceNotifier;
}
