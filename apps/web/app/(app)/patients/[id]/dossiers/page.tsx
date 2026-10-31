import { LIBELLES_OREILLES_DOSSIER, LIBELLES_TYPES_GLOBAUX, typeGlobal } from '@ha/domain';
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
import { listerDossiersDuPatient } from '@/server/services/dossiers';
import { obtenirPatient } from '@/server/services/patients';

import { BadgeStatutDossier } from '../../../dossiers/badge-statut-dossier';
import { AlerteDroits, EntetePatient } from '../../entete-patient';
import { OngletsPatient } from '../../onglets-patient';

export const metadata: Metadata = { title: 'Dossiers du patient – HA-Gestion' };

export default async function PageDossiersPatient({
  params,
}: PageProps<'/patients/[id]/dossiers'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}/dossiers`);
  }
  const { fiche } = ouverture;
  const dossiers = await listerDossiersDuPatient(acteur, fiche.id);

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche}>
        <Button asChild>
          <Link href={`/patients/${fiche.id}/dossiers/nouveau`}>Nouveau dossier</Link>
        </Button>
      </EntetePatient>

      <OngletsPatient patientId={fiche.id} courant="dossiers" />

      {fiche.amo ? <AlerteDroits etat={fiche.amo.etatDroits} fin={fiche.amo.finDroits} /> : null}

      {dossiers.length === 0 ? (
        <EtatVide titre="Aucun dossier">
          Créez un dossier d’appareillage pour enregistrer la prescription.
        </EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ouverture</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Oreilles</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead>Audioprothésiste</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dossiers.map((dossier) => {
              const type = typeGlobal(dossier);
              return (
                <TableRow key={dossier.id}>
                  <TableCell>
                    <Link
                      href={`/dossiers/${dossier.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {formaterDate(dossier.dateOuverture)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <BadgeStatutDossier statut={dossier.statut} />
                  </TableCell>
                  <TableCell>{type ? LIBELLES_TYPES_GLOBAUX[type] : '—'}</TableCell>
                  <TableCell>{LIBELLES_OREILLES_DOSSIER[dossier.oreilles]}</TableCell>
                  <TableCell>{dossier.centre}</TableCell>
                  <TableCell>{dossier.praticien}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
