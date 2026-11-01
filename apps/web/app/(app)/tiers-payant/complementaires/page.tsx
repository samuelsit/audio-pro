import { LIBELLES_MODES_PEC, peutGererComplementaires } from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Badge } from '@/components/ui/badge';
import { requireSession } from '@/server/auth/gardes';
import { listerComplementaires } from '@/server/services/complementaires';

import { FormulaireComplementaire } from '../formulaires';

export const metadata: Metadata = { title: 'Complémentaires – HA-Gestion' };

export default async function PageComplementaires() {
  const acteur = await requireSession();
  const complementaires = await listerComplementaires(acteur);
  const gerable = peutGererComplementaires(acteur.role);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Complémentaires">
        Référentiel des organismes, repris par les prises en charge et les virements.
      </EntetePage>
      {gerable ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Ajouter une complémentaire
          </summary>
          <div className="mt-3">
            <FormulaireComplementaire />
          </div>
        </details>
      ) : null}
      {complementaires.length === 0 ? (
        <EtatVide titre="Aucune complémentaire">
          Ajoutez les organismes que vous rencontrez le plus souvent.
        </EtatVide>
      ) : (
        <ul className="grid gap-3">
          {complementaires.map((c) => (
            <li key={c.id} className="grid gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{c.nom}</span>
                <span className="font-mono text-sm">{c.identifiant}</span>
                <Badge variant="secondary">{LIBELLES_MODES_PEC[c.modePec]}</Badge>
                {c.actif ? null : <Badge variant="outline">Inactive</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {[c.plateformeTiersPayant, c.telephone, c.email, c.adresse]
                  .filter(Boolean)
                  .join(', ')}
                {` Délai attendu : ${String(c.delaiPaiementJours)} jours.`}
              </p>
              {gerable ? (
                <details>
                  <summary className="cursor-pointer text-sm">Modifier</summary>
                  <div className="mt-3">
                    <FormulaireComplementaire complementaire={c} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
