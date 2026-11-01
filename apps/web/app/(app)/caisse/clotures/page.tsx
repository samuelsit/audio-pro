import {
  centimes,
  formatEuros,
  LIBELLES_MODES_PAIEMENT,
  LIBELLES_PORTEES_CLOTURE,
  totauxClotureSchema,
} from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { Badge } from '@/components/ui/badge';
import { formaterDate, formaterDateHeure } from '@/lib/format';
import { ouIntrouvable } from '@/server/auth/gardes';
import { listerClotures } from '@/server/services/caisse';

import { centreDeCaisse, ChoisirUnCentre } from '../centre';
import { BoutonClotures } from '../formulaires';

export const metadata: Metadata = { title: 'Clôtures – HA-Gestion' };

const euros = (valeur: number | bigint) => formatEuros(centimes(Number(valeur)));

const POUR_MILLE = 100;

export default async function PageClotures() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  const clotures = await ouIntrouvable(listerClotures(acteur, centreId));
  return (
    <div className="grid gap-6">
      <EntetePage titre="Clôtures">
        Figées et chaînées chaque nuit, journée, mois et exercice. La journée en cours ne se clôture
        pas.
      </EntetePage>
      <BoutonClotures centreId={centreId} />
      {clotures.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune clôture pour ce centre.</p>
      ) : null}
      <div className="grid gap-4">
        {clotures.map((c) => {
          const totaux = totauxClotureSchema.parse(c.totaux);
          return (
            <section key={c.id} className="grid gap-2 rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{LIBELLES_PORTEES_CLOTURE[c.portee]}</Badge>
                <span className="font-medium">
                  {formaterDate(c.debut.toISOString().slice(0, 10))}
                  {c.portee === 'JOUR'
                    ? ''
                    : ` au ${formaterDate(c.fin.toISOString().slice(0, 10))}`}
                </span>
                <span className="text-muted-foreground">
                  rangs {c.rangDebut} à {c.rangFin}, le {formaterDateHeure(c.createdAt)}
                </span>
              </div>
              <p>
                {totaux.factures} facture(s), {totaux.avoirs} avoir(s) : {euros(totaux.ttc)} TTC,
                dont {euros(totaux.tva)} de TVA. Encaissements nets{' '}
                {euros(totaux.encaissementsNets)}, dont acomptes {euros(totaux.acomptesNets)}.
              </p>
              <ul>
                {totaux.parMode.map((m) => (
                  <li key={m.mode}>
                    {LIBELLES_MODES_PAIEMENT[m.mode]} : {euros(m.encaisse)} encaissés,{' '}
                    {euros(m.rendu)} rendus
                  </li>
                ))}
                {totaux.parTaux.map((t) => (
                  <li key={t.taux}>
                    TVA {t.taux === null ? 'sans taux' : `${String(t.taux / POUR_MILLE)} %`} :{' '}
                    {euros(t.ht)} HT, {euros(t.tva)} de TVA, {euros(t.ttc)} TTC
                  </li>
                ))}
              </ul>
              <p>
                Grand total de l’exercice {euros(c.grandTotalCentimes)}, total perpétuel{' '}
                {euros(c.perpetuelCentimes)}, encaissements perpétuels{' '}
                {euros(c.encaissePerpetuelCentimes)}.
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
