import { FakePecGateway } from '@ha/adapters';
import type { PecGateway } from '@ha/domain';

function simulation(): boolean {
  return process.env.PEC_GATEWAY === 'simulation' && process.env.NODE_ENV !== 'production';
}

let instance: PecGateway | undefined;

/** Faux hors simulation : l'écran reste en saisie manuelle, depuis le portail de l'organisme. */
export function pecGatewayDisponible(): boolean {
  return simulation();
}

/** Plateforme de tiers payant : simulation hors production, en attendant l'étape 28 (ADR-030). */
export function pecGateway(): PecGateway {
  if (!simulation()) {
    // À VÉRIFIER : l'adaptateur réel arrive à l'étape 28, docs/vendor/pec n'existe pas.
    throw new Error('Aucune plateforme de prise en charge n’est configurée.');
  }
  instance ??= new FakePecGateway();
  return instance;
}
