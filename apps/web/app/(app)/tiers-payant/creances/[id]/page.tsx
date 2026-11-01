import {
  formatEuros,
  LIBELLES_NATURES_REGULARISATION,
  LIBELLES_RESOLUTIONS_REJET,
  LIBELLES_STATUTS_CREANCE,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formaterDate, formaterJour } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { aujourdhui } from '@/server/services/patients';
import { obtenirCreance } from '@/server/services/tiers-payant';

import {
  BoutonRelance,
  FormulaireEcartCreance,
  FormulaireRejet,
  FormulaireTransfert,
} from '../../formulaires';

export const metadata: Metadata = { title: 'Créance – HA-Gestion' };

/** Ouvrir une créance écrit une ligne READ dans le journal d'audit (service). */
export default async function PageCreance({ params }: PageProps<'/tiers-payant/creances/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const c = await ouIntrouvable(obtenirCreance(acteur, id));
  const ouverte = c.solde > 0;
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Créance ${c.type} ${c.numeroFacture ?? ''}`}>
        {c.organisme}, {c.patient}. Émise le {formaterDate(c.dateEmission)}, échéance attendue le{' '}
        {formaterDate(c.echeanceAttendue)}.
      </EntetePage>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">{LIBELLES_STATUTS_CREANCE[c.statut]}</Badge>
        <span className="text-sm">
          Montant {formatEuros(c.montant)}, solde {formatEuros(c.solde)}
        </span>
        <Button asChild variant="outline" className="ml-auto">
          <Link href={`/factures/${c.factureId}`}>Facture</Link>
        </Button>
      </div>
      {c.statut === 'INDU' ? (
        <p className="text-sm">
          L’organisme a payé plus que ce qui reste dû après un avoir. Délettrez le règlement pour le
          reporter sur une autre créance.
        </p>
      ) : null}
      {c.lettrages.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Règlements lettrés</h2>
          <ul className="grid gap-1 text-sm">
            {c.lettrages.map((l) => (
              <li key={l.id}>
                {l.reference} : {formatEuros(l.montant)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {c.regularisations.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Régularisations</h2>
          <ul className="grid gap-1 text-sm">
            {c.regularisations.map((r) => (
              <li key={r.id}>
                {formaterJour(r.creeLe.toISOString())}, {LIBELLES_NATURES_REGULARISATION[r.nature]}{' '}
                : {formatEuros(r.montant)}, {r.motif}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {c.rejets.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Rejets</h2>
          <ul className="grid gap-1 text-sm">
            {c.rejets.map((r) => (
              <li key={r.id}>
                {formaterDate(r.dateRejet)}
                {r.code ? ` (${r.code})` : ''} : {r.motif}
                {r.resolution ? `, ${LIBELLES_RESOLUTIONS_REJET[r.resolution].toLowerCase()}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {ouverte ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="grid content-start gap-2">
            <h2 className="text-lg font-medium">Rejet de l’organisme</h2>
            <FormulaireRejet creanceId={c.id} jour={aujourdhui()} />
          </section>
          {c.regulariser ? (
            <>
              <section className="grid content-start gap-2">
                <h2 className="text-lg font-medium">Transfert au patient</h2>
                <FormulaireTransfert creanceId={c.id} solde={c.solde} />
              </section>
              <section className="grid content-start gap-2">
                <h2 className="text-lg font-medium">Écart</h2>
                <FormulaireEcartCreance creanceId={c.id} solde={c.solde} />
              </section>
            </>
          ) : null}
          <div>
            <BoutonRelance creanceId={c.id} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
