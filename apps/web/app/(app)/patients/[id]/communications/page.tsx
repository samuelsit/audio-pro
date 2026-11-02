import {
  LIBELLES_CANAUX_MESSAGE,
  LIBELLES_FINALITES_MESSAGE,
  LIBELLES_MOTIFS_BLOCAGE,
  LIBELLES_ORIGINES_CONSENTEMENT,
  LIBELLES_SCENARIOS,
  LIBELLES_STATUTS_MESSAGE,
  localDepuisInstant,
  type MotifBlocage,
} from '@ha/domain';
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
import { obtenirPatient } from '@/server/services/patients';
import { historiquePatient } from '@/server/services/suivi-messages';

import { EntetePatient } from '../../entete-patient';
import { OngletsPatient } from '../../onglets-patient';
import { noterConsentementAction } from './actions';
import { FormulaireConsentement } from './formulaire-consentement';

export const metadata: Metadata = { title: 'Communications du patient – HA-Gestion' };

function jour(instant: string): string {
  return formaterDate(localDepuisInstant(Date.parse(instant)).date);
}

export default async function PageCommunicationsPatient({
  params,
}: PageProps<'/patients/[id]/communications'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}/communications`);
  }
  const { fiche } = ouverture;
  const { messages, evenements, oppositions } = await historiquePatient(acteur, fiche.id);

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} />
      <OngletsPatient patientId={fiche.id} courant="communications" />
      {oppositions.length > 0 ? (
        <p role="status" className="text-sm font-medium">
          Le patient s’est opposé à :{' '}
          {oppositions.map((c) => LIBELLES_CANAUX_MESSAGE[c]).join(', ')}. Rien ne part sur ce
          canal, rappels compris, tant qu’un nouveau consentement n’est pas noté.
        </p>
      ) : null}
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Messages</h2>
        {messages.length === 0 ? (
          <EtatVide titre="Aucun message">Les messages à ce patient apparaîtront ici.</EtatVide>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{jour(m.date)}</TableCell>
                  <TableCell>{LIBELLES_CANAUX_MESSAGE[m.canal]}</TableCell>
                  <TableCell>
                    {m.campagne ?? (m.scenario ? LIBELLES_SCENARIOS[m.scenario] : 'Centre')}
                  </TableCell>
                  <TableCell>{m.sujet ?? '—'}</TableCell>
                  <TableCell className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{LIBELLES_STATUTS_MESSAGE[m.statut]}</Badge>
                    {m.motif && m.motif in LIBELLES_MOTIFS_BLOCAGE
                      ? LIBELLES_MOTIFS_BLOCAGE[m.motif as MotifBlocage]
                      : null}
                    {m.clicLe ? <Badge variant="outline">Clic</Badge> : null}
                    {m.desinscritLe ? <Badge variant="outline">Désinscription</Badge> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Noter un nouveau consentement</h2>
        <p className="text-sm text-muted-foreground">
          Seule cette action lève une opposition. À n’utiliser que si le patient vient de
          l’exprimer.
        </p>
        <FormulaireConsentement action={noterConsentementAction.bind(null, fiche.id)} />
      </section>
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Journal des consentements</h2>
        {evenements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun changement enregistré. Un consentement antérieur à ce journal n’a pas de date
            connue.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Finalité</TableHead>
                <TableHead>Décision</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Par</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evenements.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{jour(e.date)}</TableCell>
                  <TableCell>{LIBELLES_CANAUX_MESSAGE[e.canal]}</TableCell>
                  <TableCell>{LIBELLES_FINALITES_MESSAGE[e.finalite]}</TableCell>
                  <TableCell>{e.accorde ? 'Accordé' : 'Retiré'}</TableCell>
                  <TableCell>{LIBELLES_ORIGINES_CONSENTEMENT[e.origine]}</TableCell>
                  <TableCell>{e.auteur}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
