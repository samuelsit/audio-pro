import { encoderSimulation, INCIDENTS_SIMULES, decoderSimulation } from '@ha/adapters';
import { cookies } from 'next/headers';

import {
  cartesDeSimulation,
  COOKIE_SIMULATION_VITALE,
  simulationVitaleActive,
} from '@/server/vitale/lecteur';

import { BoutonLectureVitale, type OptionsSimulation } from './bouton-lecture-vitale';
import { choisirCarteSimuleeAction, lireCarteAction } from './vitale/actions';

/**
 * Lecture de la carte Vitale depuis la liste ou une fiche (`patientId` : fiche d'origine, proposée à la
 * comparaison si la carte ne correspond à aucune fiche).
 */
export async function LectureVitale({ patientId = null }: { patientId?: string | null }) {
  let simulation: OptionsSimulation | null = null;
  if (simulationVitaleActive()) {
    const courante = decoderSimulation((await cookies()).get(COOKIE_SIMULATION_VITALE)?.value);
    const cartes = await cartesDeSimulation();
    simulation = {
      courante: encoderSimulation(courante),
      options: [
        ...cartes.map((c) => ({
          valeur: encoderSimulation({ type: 'carte', fichier: c.fichier }),
          libelle: c.libelle,
        })),
        ...INCIDENTS_SIMULES.map((i) => ({ valeur: encoderSimulation(i), libelle: i.libelle })),
      ],
      choisir: choisirCarteSimuleeAction,
    };
  }
  return (
    <BoutonLectureVitale action={lireCarteAction.bind(null, patientId)} simulation={simulation} />
  );
}
