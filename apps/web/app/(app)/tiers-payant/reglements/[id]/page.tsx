import { formatEuros } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { obtenirReglement } from '@/server/services/tiers-payant';

import {
  BoutonDelettrer,
  FormulaireAnnulationReglement,
  FormulaireEcartReglement,
  FormulaireLettrage,
} from '../../formulaires';

export const metadata: Metadata = { title: 'Règlement – HA-Gestion' };

export default async function PageReglement({
  params,
}: PageProps<'/tiers-payant/reglements/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const r = await ouIntrouvable(obtenirReglement(acteur, id));
  const candidates = r.candidates.filter((c) => r.resteParType[c.type] > 0);
  const lettrable = !r.annule && r.reste > 0;
  const actifs = r.lettrages.filter((l) => !l.defait);
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Règlement ${r.reference}`}>
        {r.organisme}, {r.centre}, virement du {formaterDate(r.dateReglement)}.
      </EntetePage>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          Part AMO {formatEuros(r.partAmo)}, part AMC {formatEuros(r.partAmc)}, reste à lettrer{' '}
          {formatEuros(r.reste)}
        </span>
        <Button asChild variant="outline" className="ml-auto">
          <Link href="/tiers-payant/reglements">Retour aux règlements</Link>
        </Button>
      </div>
      {r.annule ? (
        <Alert>
          <AlertTitle>Règlement annulé</AlertTitle>
          <AlertDescription>{r.motifAnnulation}</AlertDescription>
        </Alert>
      ) : null}
      {r.lettrages.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Lettrages</h2>
          <ul className="grid gap-2 text-sm">
            {r.lettrages.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3">
                <span>
                  <Link
                    href={`/tiers-payant/creances/${l.creanceId}`}
                    className="underline underline-offset-2"
                  >
                    {l.numeroFacture} {l.type}
                  </Link>
                  , {l.patient} : {formatEuros(l.montant)}
                  {l.defait ? ' (défait)' : ''}
                </span>
                {r.regulariser && !l.defait ? <BoutonDelettrer lettrageId={l.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {lettrable ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Lettrer sur des créances</h2>
          {candidates.length > 0 ? (
            <FormulaireLettrage reglementId={r.id} candidates={candidates} />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune créance ouverte dans ce centre.</p>
          )}
        </section>
      ) : null}
      {r.regulariser && lettrable ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Trop versé</h2>
          <FormulaireEcartReglement reglementId={r.id} />
        </section>
      ) : null}
      {r.regulariser && !r.annule && actifs.length === 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Annuler</h2>
          <FormulaireAnnulationReglement reglementId={r.id} />
        </section>
      ) : null}
    </div>
  );
}
