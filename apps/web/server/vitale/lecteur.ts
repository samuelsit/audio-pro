import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  cartesSimulees,
  decoderSimulation,
  FakeVitaleReader,
  LecteurVitaleAbsent,
  SystemClock,
} from '@ha/adapters';
import type { VitaleReader } from '@ha/domain';

/** Cookie de développement : carte « insérée » dans le lecteur simulé. */
export const COOKIE_SIMULATION_VITALE = 'ha_vitale_simulation';

/** Lecteur simulé : seulement avec VITALE_LECTEUR=simulation, et jamais en production. */
export function simulationVitaleActive(): boolean {
  return process.env.VITALE_LECTEUR === 'simulation' && process.env.NODE_ENV !== 'production';
}

/** Dossier des cartes fictives : VITALE_FIXTURES, sinon fixtures/vitale à la racine du dépôt. */
export function dossierCartesSimulees(): string {
  if (process.env.VITALE_FIXTURES) {
    return process.env.VITALE_FIXTURES;
  }
  const racine = path.resolve(process.cwd(), 'fixtures/vitale');
  // `next dev` et Playwright tournent depuis apps/web.
  const depuisApplication = path.resolve(process.cwd(), '../../fixtures/vitale');
  return existsSync(racine) ? racine : depuisApplication;
}

export async function cartesDeSimulation(): Promise<{ fichier: string; libelle: string }[]> {
  return simulationVitaleActive() ? cartesSimulees(dossierCartesSimulees()) : [];
}

/**
 * Lecteur du poste. Tant qu'aucun lecteur réel n'est branché (AreaFSE, étape 17), hors simulation toute
 * lecture échoue avec AUCUN_LECTEUR.
 */
export function lecteurVitale(valeurSimulation: string | undefined): VitaleReader {
  if (!simulationVitaleActive()) {
    return new LecteurVitaleAbsent();
  }
  return new FakeVitaleReader({
    dossier: dossierCartesSimulees(),
    simulation: decoderSimulation(valeurSimulation),
    clock: new SystemClock(),
  });
}
