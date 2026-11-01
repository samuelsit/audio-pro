import {
  formatEuros,
  centimes,
  LIBELLES_MODES_PAIEMENT,
  LIBELLES_NATURES_MOUVEMENT,
  peutGererCaisse,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate, formaterDateHeure } from '@/lib/format';
import { caisseDuJour } from '@/server/services/caisse';

import { centreDeCaisse, ChoisirUnCentre } from './centre';
import { FormulaireComptage, FormulaireOuverture } from './formulaires';

export const metadata: Metadata = { title: 'Caisse – HA-Gestion' };

const euros = (valeur: number) => formatEuros(centimes(valeur));
const saisie = (valeur: number) => (valeur / 100).toFixed(2).replace('.', ',');

export default async function PageCaisse() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  const { jour, session, comptages, mouvements, fondPropose, theorique, echec } =
    await caisseDuJour(acteur, centreId);
  const dernier = comptages.at(-1);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Caisse du jour">{formaterDate(jour)}</EntetePage>

      {echec ? (
        <Alert variant="destructive">
          <AlertTitle>Échec de vérification de la chaîne</AlertTitle>
          <AlertDescription>
            Constaté le {formaterDateHeure(echec.createdAt)}.{' '}
            {peutGererCaisse(acteur.role) ? (
              <Link href="/caisse/verification" className="underline underline-offset-2">
                Voir la vérification
              </Link>
            ) : (
              'Prévenez le responsable du centre.'
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {session ? (
        <dl className="grid max-w-sm grid-cols-2 gap-1 text-sm">
          <dt>Fond de caisse</dt>
          <dd className="text-right">{euros(session.fondCentimes)}</dd>
          <dt>Espèces attendues</dt>
          <dd className="text-right">{euros(theorique ?? 0)}</dd>
          {dernier ? (
            <>
              <dt>Espèces comptées</dt>
              <dd className="text-right">{euros(dernier.compteesCentimes)}</dd>
              <dt>Écart</dt>
              <dd className="text-right">{euros(dernier.ecartCentimes)}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Ouverture</h2>
          <FormulaireOuverture centreId={centreId} fondPropose={saisie(fondPropose)} />
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Opérations du jour</h2>
        {mouvements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune opération aujourd’hui.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Heure</TableHead>
                <TableHead>Opération</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Pièce</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Rendu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mouvements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{formaterDateHeure(m.createdAt)}</TableCell>
                  <TableCell>{LIBELLES_NATURES_MOUVEMENT[m.nature]}</TableCell>
                  <TableCell>
                    {m.patient.prenoms} {m.patient.nomUsage ?? m.patient.nomNaissance}
                  </TableCell>
                  <TableCell>
                    {m.facture ? (
                      <Link
                        href={`/factures/${m.facture.id}`}
                        className="underline underline-offset-2"
                      >
                        {m.facture.numero}
                      </Link>
                    ) : (
                      'Acompte'
                    )}
                  </TableCell>
                  <TableCell>{LIBELLES_MODES_PAIEMENT[m.mode]}</TableCell>
                  <TableCell className="text-right">{euros(m.montantCentimes)}</TableCell>
                  <TableCell className="text-right">{euros(m.renduCentimes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {session ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Comptage</h2>
          {comptages.map((c) => (
            <p key={c.id} className="text-sm">
              {formaterDateHeure(c.createdAt)} : {euros(c.compteesCentimes)} comptés, écart{' '}
              {euros(c.ecartCentimes)}
              {c.justification ? ` (${c.justification})` : ''}
            </p>
          ))}
          <FormulaireComptage centreId={centreId} />
        </section>
      ) : null}
    </div>
  );
}
