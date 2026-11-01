import { clientPlateforme } from '@ha/db';
import { quotaPilesSaisieSchema, type QuotaPilesDate } from '@ha/domain';

import type { SuperadminConnecte } from '../auth/acces';
import { withAuditPlateforme } from '../audit/journal';
import { traduireDoublon, valider } from '../erreurs';
import { depuisDate, versDate } from './dossiers';
import { verifierSuperadmin } from './organisations';
import type { Client } from './patients';

/** Quotas en base, communs à tous les clients ; le choix de la date revient à `quotaPilesEnVigueur`. */
export async function quotasPilesDates(client: Client): Promise<QuotaPilesDate[]> {
  const lignes = await client.quotaPiles.findMany({ select: { debut: true, boitesParAn: true } });
  return lignes.map((l) => ({ ...l, debut: depuisDate(l.debut) }));
}

export interface QuotaPilesListe extends QuotaPilesDate {
  source: string;
}

export async function listerQuotasPiles(acteur: SuperadminConnecte): Promise<QuotaPilesListe[]> {
  verifierSuperadmin(acteur);
  const lignes = await clientPlateforme().quotaPiles.findMany({
    select: { debut: true, boitesParAn: true, source: true },
    orderBy: { debut: 'desc' },
  });
  return lignes.map((l) => ({ ...l, debut: depuisDate(l.debut) }));
}

/** Ajoute un quota daté, avec le texte qui le fixe. À VÉRIFIER : aucun quota dans docs/ref (R15). */
export async function ajouterQuotaPiles(
  acteur: SuperadminConnecte,
  saisie: unknown,
): Promise<void> {
  verifierSuperadmin(acteur);
  const { boitesParAn, debut, source } = valider(quotaPilesSaisieSchema, saisie);
  try {
    await withAuditPlateforme(
      acteur,
      (tx) =>
        tx.quotaPiles.create({
          data: { boitesParAn, debut: versDate(debut), source },
          select: { id: true },
        }),
      () => null,
      ({ id }) => ({
        action: 'CREATE',
        entiteType: 'QUOTA_PILES',
        entiteId: id,
        details: { boitesParAn, debut },
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, {}, 'Un quota existe déjà à cette date.');
  }
}
