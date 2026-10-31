import { formaterDb, rendreEvolutionSvg } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerBilans } from '@/server/services/audiologie';
import { aujourdhui, obtenirPatient } from '@/server/services/patients';

import { EntetePatient } from '../../entete-patient';
import { OngletsPatient } from '../../onglets-patient';
import { creerBilanAction } from './actions';
import { BadgeSource, Graphique, libelleGrade } from './composants';
import { FormulaireBilan } from './formulaire-bilan';

export const metadata: Metadata = { title: 'Audiologie du patient – HA-Gestion' };

function celluleOreille(resultat: { perteMoyenne: number | null; grade: number | null } | null) {
  if (resultat?.perteMoyenne == null) {
    return '—';
  }
  return `${formaterDb(resultat.perteMoyenne)}, grade ${String(resultat.grade)}`;
}

export default async function PageAudiologie({ params }: PageProps<'/patients/[id]/audiologie'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}/audiologie`);
  }
  const { fiche } = ouverture;
  const bilans = await listerBilans(acteur, fiche.id);
  const avecTonale = bilans.flatMap((b) =>
    b.tonale ? [{ date: b.dateBilan, tonale: b.tonale }] : [],
  );
  const recents = [...bilans].reverse();

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} />
      <OngletsPatient patientId={fiche.id} courant="audiologie" />
      <FormulaireBilan action={creerBilanAction.bind(null, fiche.id)} jour={aujourdhui()} />
      {bilans.length === 0 ? (
        <EtatVide titre="Aucun bilan">
          Les bilans audiologiques de ce patient apparaîtront ici.
        </EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead>Oreille droite</TableHead>
              <TableHead>Oreille gauche</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recents.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link
                    href={`/patients/${fiche.id}/audiologie/${b.id}`}
                    className="font-medium hover:underline"
                  >
                    {formaterDate(b.dateBilan)}
                  </Link>
                </TableCell>
                <TableCell>{b.centreNom}</TableCell>
                <TableCell>{celluleOreille(b.tonale?.synthese.droite ?? null)}</TableCell>
                <TableCell>{celluleOreille(b.tonale?.synthese.gauche ?? null)}</TableCell>
                <TableCell>{b.tonale ? <BadgeSource source={b.tonale.source} /> : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {avecTonale.length > 0 ? (
        <section className="grid gap-3" aria-label="Évolution">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Évolution</h2>
            {avecTonale.length > 1 ? (
              <Button asChild variant="outline">
                <Link href={`/patients/${fiche.id}/audiologie/comparer`}>
                  Comparer deux audiogrammes
                </Link>
              </Button>
            ) : null}
          </div>
          <Graphique
            svg={rendreEvolutionSvg(
              avecTonale.map(({ date, tonale }) => ({
                date,
                droite: tonale.synthese.droite.perteMoyenne,
                gauche: tonale.synthese.gauche.perteMoyenne,
              })),
            )}
          />
          <p className="sr-only">
            {avecTonale
              .map(
                ({ date, tonale }) =>
                  `${formaterDate(date)} : ${libelleGrade(tonale.synthese.droite)}`,
              )
              .join(' ; ')}
          </p>
        </section>
      ) : null}
    </div>
  );
}
