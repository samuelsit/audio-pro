import { centimes, formatEuros, LIBELLES_ACTIONS_SAV, LIBELLES_MOTIFS_SAV } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EntetePage } from '@/components/entete-page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerModeles } from '@/server/services/catalogue';
import { fournisseursDuRetour, retourDuTicket } from '@/server/services/retours-fabricant';
import { obtenirTicket } from '@/server/services/tickets-sav';

import { BadgeCouverture, BadgeTicket } from '../../badge-ticket';
import {
  ActionRemise,
  ActionReparationTerminee,
  ActionRestitution,
  FormulaireAbandonRemplacant,
  FormulaireAnnulation,
  FormulaireCorrectionSerie,
  FormulaireDiagnostic,
  FormulaireFacturation,
  FormulairePreparationRetour,
  FormulaireRemplacant,
} from '../../formulaires';

export const metadata: Metadata = { title: 'Ticket SAV – HA-Gestion' };

function Information({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function PageTicket({ params }: PageProps<'/sav/tickets/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const ticket = await ouIntrouvable(obtenirTicket(acteur, id));
  const ouvert = ticket.statut === 'OUVERT' || ticket.statut === 'EN_COURS';
  const retour = await retourDuTicket(acteur, id);
  const retourEnCours = retour?.statut === 'PREPARE' || retour?.statut === 'ENVOYE';
  const versFabricant = ticket.action === 'ENVOI_FABRICANT' || ticket.action === 'ECHANGE';
  const perdu = ticket.motif === 'PERTE' || ticket.motif === 'VOL';
  const attendRemplacant =
    ticket.statut === 'CHEZ_FABRICANT' ||
    (ticket.statut === 'EN_COURS' && ticket.action === 'ECHANGE' && perdu);
  const fournisseurs =
    ticket.statut === 'EN_COURS' && versFabricant && !retourEnCours && !perdu
      ? await fournisseursDuRetour(acteur, ticket.appareil.fabricantId)
      : null;
  const modeles = attendRemplacant ? await listerModeles(acteur) : [];
  return (
    <div className="grid gap-6">
      <EntetePage titre={ticket.numero}>
        {ticket.appareil.designation}, série {ticket.appareil.numeroSerie}
      </EntetePage>

      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Information libelle="Statut">
          <BadgeTicket statut={ticket.statut} />
        </Information>
        <Information libelle="Couverture">
          <BadgeCouverture couverture={ticket.couverture} />
        </Information>
        <Information libelle="Motif">{LIBELLES_MOTIFS_SAV[ticket.motif]}</Information>
        <Information libelle="Patient">
          {ticket.patient ? (
            <Link href={`/patients/${ticket.patient.id}`} className="underline underline-offset-2">
              {ticket.patient.libelle}
            </Link>
          ) : ticket.patientMasque ? (
            'Patient d’un autre centre'
          ) : (
            '—'
          )}
        </Information>
        <Information libelle="Appareil">
          <Link
            href={`/stock/appareils/${ticket.appareil.id}`}
            className="underline underline-offset-2"
          >
            {ticket.appareil.numeroSerie}
          </Link>
        </Information>
        <Information libelle="Centre">{ticket.centre}</Information>
        <Information libelle="Ouvert le">{formaterDate(ticket.dateOuverture)}</Information>
        <Information libelle="Diagnostic le">{formaterDate(ticket.dateDiagnostic)}</Information>
        <Information libelle="Réparé le">{formaterDate(ticket.dateReparation)}</Information>
        <Information libelle="Clôturé le">{formaterDate(ticket.dateCloture)}</Information>
        <Information libelle="Garantie">
          {ticket.garantie ? `Jusqu’au ${formaterDate(ticket.garantie.dateFin)}` : 'Aucune'}
        </Information>
        <Information libelle="Action">
          {ticket.action ? LIBELLES_ACTIONS_SAV[ticket.action] : '—'}
        </Information>
        <Information libelle="Coût">
          {ticket.coutCentimes === null ? '—' : formatEuros(centimes(ticket.coutCentimes))}
        </Information>
        <Information libelle="Retour fabricant">
          {retour ? (
            <Link href={`/sav/retours/${retour.id}`} className="underline underline-offset-2">
              {retour.numero}
            </Link>
          ) : (
            '—'
          )}
        </Information>
        <Information libelle="Remplaçant">
          {ticket.remplacant ? (
            <Link
              href={`/stock/appareils/${ticket.remplacant.id}`}
              className="underline underline-offset-2"
            >
              {ticket.remplacant.numeroSerie}
            </Link>
          ) : (
            '—'
          )}
        </Information>
        <Information libelle="Facture">
          {ticket.facture ? (
            <Link href={`/factures/${ticket.facture.id}`} className="underline underline-offset-2">
              {ticket.facture.numero ?? 'Brouillon'}
            </Link>
          ) : (
            '—'
          )}
        </Information>
      </dl>

      {ticket.description ? (
        <Section titre="Signalement">
          <p className="text-sm whitespace-pre-line">{ticket.description}</p>
        </Section>
      ) : null}
      {ticket.motifAnnulation ? (
        <Section titre="Motif d’annulation">
          <p className="text-sm whitespace-pre-line">{ticket.motifAnnulation}</p>
        </Section>
      ) : null}
      {ticket.motifFacturation ? (
        <Section titre="Motif de facturation">
          <p className="text-sm whitespace-pre-line">{ticket.motifFacturation}</p>
        </Section>
      ) : null}

      {ouvert && ticket.peutDiagnostiquer ? (
        <Section titre="Diagnostic">
          <FormulaireDiagnostic ticket={ticket} />
        </Section>
      ) : ticket.diagnostic ? (
        <Section titre="Diagnostic">
          <p className="text-sm whitespace-pre-line">{ticket.diagnostic}</p>
        </Section>
      ) : null}

      {ticket.statut === 'EN_COURS' && ticket.action === 'REPARATION_CENTRE' ? (
        <ActionReparationTerminee ticketId={ticket.id} />
      ) : null}
      {ticket.statut === 'A_RESTITUER' && ticket.remplacant === null ? (
        <ActionRestitution ticketId={ticket.id} />
      ) : null}

      {fournisseurs && ticket.peutDiagnostiquer ? (
        <Section titre="Retour au fabricant">
          <FormulairePreparationRetour
            ticketId={ticket.id}
            fournisseurs={fournisseurs.options}
            defaut={fournisseurs.defaut}
          />
        </Section>
      ) : null}
      {attendRemplacant && ticket.peutDiagnostiquer ? (
        <Section titre="Remplaçant">
          <FormulaireRemplacant
            ticketId={ticket.id}
            modeles={modeles
              .filter((m) => m.actif)
              .map((m) => ({ id: m.id, libelle: `${m.fabricant} ${m.gamme} ${m.nom}` }))}
            modeleId={ticket.appareil.modeleId}
          />
        </Section>
      ) : null}
      {ticket.statut === 'A_RESTITUER' && ticket.remplacant ? (
        <Section titre="Remise du remplaçant">
          <div className="grid gap-6">
            <ActionRemise ticketId={ticket.id} />
            {ticket.peutDiagnostiquer ? (
              <>
                <FormulaireCorrectionSerie ticketId={ticket.id} />
                <FormulaireAbandonRemplacant ticketId={ticket.id} />
              </>
            ) : null}
          </div>
        </Section>
      ) : null}

      {ticket.peutFacturer ? (
        <Section titre="Facturer">
          <FormulaireFacturation ticketId={ticket.id} />
        </Section>
      ) : null}
      {ouvert && ticket.peutDiagnostiquer ? (
        <Section titre="Annuler">
          <FormulaireAnnulation ticketId={ticket.id} />
        </Section>
      ) : null}
    </div>
  );
}
