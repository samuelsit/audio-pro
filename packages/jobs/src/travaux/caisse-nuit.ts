import {
  archiverCentre,
  cloturerCentre,
  journaliserEchec,
  verifierCentre,
  type DepsCaisse,
  type TxCaisse,
} from '@ha/caisse';
import { clientPlateforme } from '@ha/db';
import type { Clock, DocumentStore, Hacheur, SignatureCaisse } from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, enTransaction, type ContexteTravail, type Travail } from '../travail';

const chargeCaisse = z.object({});
type ChargeCaisse = typeof chargeCaisse;

export interface DependancesCaisseNuit {
  readonly horloge: Clock;
  readonly hacheur: Hacheur;
  readonly signature: SignatureCaisse;
  /** `null` sans stockage réel : les clôtures se font, l'archivage attend. */
  readonly documents: DocumentStore | null;
}

async function traiterCentre(
  { client, organisationId }: ContexteTravail,
  { horloge, hacheur, signature, documents }: DependancesCaisseNuit,
  centreId: string,
): Promise<void> {
  const deps: DepsCaisse = {
    organisationId,
    acteurId: null,
    horloge,
    hacheur,
    signature,
    transaction: (operation) => enTransaction(organisationId, operation),
  };
  // Vérifier d'abord, mais clôturer quand même : les clôtures sont impératives, et l'échec reste journalisé.
  const resultat = await verifierCentre(client as unknown as TxCaisse, centreId, deps);
  if (!resultat.valide) {
    await deps.transaction((tx) => journaliserEchec(tx, deps, centreId, resultat));
  }
  await cloturerCentre(deps, centreId);
  if (documents) {
    await archiverCentre(deps, documents, centreId);
  }
}

/**
 * Vérifie, clôture et archive chaque centre. Idempotent : chaque clôture et chaque archive est unique par centre
 * et par période, et relue sous le verrou de la chaîne avant d'être écrite. Un centre en échec ne bloque pas les
 * autres, et le travail repart en erreur pour être rejoué.
 */
export function travailCaisseNuit(dependances: DependancesCaisseNuit): Travail<ChargeCaisse> {
  return definirTravail({
    nom: 'caisse-nuit',
    charge: chargeCaisse,
    async executer(contexte) {
      const centres = await contexte.client.centre.findMany({ select: { id: true } });
      const resultats = await Promise.allSettled(
        centres.map(({ id }) => traiterCentre(contexte, dependances, id)),
      );
      const echecs = resultats.filter((r) => r.status === 'rejected');
      if (echecs.length > 0) {
        throw new AggregateError(
          echecs.map((e) => e.reason as unknown),
          `Caisse : ${String(echecs.length)} centre(s) en échec.`,
        );
      }
    },
  });
}

/** Un travail par client, sous sa RLS. */
export async function repartirCaisse(
  file: FileTravaux,
  travail: Travail<ChargeCaisse>,
): Promise<void> {
  const organisations = await clientPlateforme().organisation.findMany({ select: { id: true } });
  for (const { id: organisationId } of organisations) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'caisse-nuit', charge: {} });
  }
}
