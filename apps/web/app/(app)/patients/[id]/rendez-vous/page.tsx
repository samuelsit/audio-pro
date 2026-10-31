import { LIBELLES_STATUTS_RDV, localDepuisInstant } from '@ha/domain';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EtatVide } from '@/components/etat-vide';
import { Badge } from '@/components/ui/badge';
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
import { listerRdvDuPatient } from '@/server/services/agenda';
import { obtenirPatient } from '@/server/services/patients';

import { EntetePatient } from '../../entete-patient';
import { OngletsPatient } from '../../onglets-patient';

export const metadata: Metadata = { title: 'Rendez-vous du patient – HA-Gestion' };

export default async function PageRendezVousPatient({
  params,
}: PageProps<'/patients/[id]/rendez-vous'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}/rendez-vous`);
  }
  const { fiche } = ouverture;
  const rdv = await listerRdvDuPatient(acteur, fiche.id);

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} />
      <OngletsPatient patientId={fiche.id} courant="rendez-vous" />
      {rdv.length === 0 ? (
        <EtatVide titre="Aucun rendez-vous">
          Les rendez-vous de ce patient apparaîtront ici.
        </EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead>Praticien</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rdv.map((r) => {
              const { date, heure } = localDepuisInstant(r.debut);
              return (
                <TableRow key={r.id}>
                  <TableCell>{formaterDate(date)}</TableCell>
                  <TableCell>{heure}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.centre}</TableCell>
                  <TableCell>{r.praticien ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{LIBELLES_STATUTS_RDV[r.statut]}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
