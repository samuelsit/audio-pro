import { changementsConsentement, type ConsentementsPatient } from '@ha/domain';

import type { UtilisateurConnecte } from '../auth/acces';
import type { ClientTransaction } from '../chiffrement';

type OrigineFiche = 'FICHE' | 'AGENDA' | 'FUSION';

/**
 * Consigne ce qui change sur la fiche, à partir de l'état relu dans la transaction : un consentement a une date,
 * et un auteur. Ne lève aucune opposition : une case recochée ne vaut pas un nouvel accord (ADR-033).
 */
export async function tracerConsentements(
  tx: Pick<ClientTransaction, 'evenementConsentement'>,
  acteur: UtilisateurConnecte,
  patientId: string,
  avant: ConsentementsPatient,
  apres: ConsentementsPatient,
  origine: OrigineFiche,
): Promise<void> {
  const changements = changementsConsentement(avant, apres);
  if (changements.length > 0) {
    await tx.evenementConsentement.createMany({
      data: changements.map((c) => ({
        ...c,
        organisationId: acteur.organisationId,
        patientId,
        origine,
        auteur: `${acteur.prenom} ${acteur.nom}`,
      })),
    });
  }
}
