import { localDepuisInstant, type EvenementAgenda, type ScenarioRdv } from '@ha/domain';

import { ecrireEvenements, type DependancesScenarios } from './travaux/declencher-scenarios';
import type { Abonne } from './travaux/diffuser-evenements';

const SCENARIO_EVENEMENT: Readonly<Record<EvenementAgenda['type'], ScenarioRdv>> = {
  RDV_CREE: 'CONFIRMATION_RDV',
  RDV_DEPLACE: 'DEPLACEMENT_RDV',
  RDV_ANNULE: 'ANNULATION_RDV',
};

/**
 * Prévient le patient d'un rendez-vous pris, déplacé ou annulé par le centre. Les rendez-vous réservés en ligne
 * ont leurs propres messages (`notifierPatientEnLigne`) : un seul avis par événement. Le rendez-vous se relit,
 * l'événement ne porte volontairement ni origine, ni rien du patient.
 */
export function abonneMessagesRdv(dependances: DependancesScenarios): Abonne {
  const { maintenant = () => new Date() } = dependances;
  return {
    nom: 'messages-rdv',
    async traiter(evenement, evenementId, contexte) {
      const { charge } = evenement;
      if (charge.patientId === null) {
        return;
      }
      const scenario = SCENARIO_EVENEMENT[evenement.type];
      const reglage = await contexte.client.reglageScenario.findFirst({
        where: { scenario, actif: true },
      });
      const rdv = await contexte.client.rendezVous.findUnique({
        where: { id: charge.rendezVousId },
        select: { id: true, debut: true, origine: true },
      });
      if (
        reglage === null ||
        rdv === null ||
        rdv.origine === 'EN_LIGNE' ||
        rdv.debut <= maintenant()
      ) {
        return;
      }
      await ecrireEvenements(
        contexte,
        scenario,
        reglage.canaux,
        [
          {
            patientId: charge.patientId,
            centreId: charge.centreId,
            cle: `${scenario}:${evenementId}`,
            rdv: { id: rdv.id, debut: rdv.debut, ...localDepuisInstant(rdv.debut.getTime()) },
            expireLe: rdv.debut,
          },
        ],
        dependances,
      );
    },
  };
}

/** Abonnés aux événements de domaine. */
export function creerAbonnes(dependances: DependancesScenarios | null): readonly Abonne[] {
  return dependances === null ? [] : [abonneMessagesRdv(dependances)];
}
