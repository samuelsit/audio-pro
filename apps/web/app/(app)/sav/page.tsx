import {
  LIBELLES_MOTIFS_SAV,
  LIBELLES_STATUTS_TICKET,
  MOTIFS_SAV,
  STATUTS_TICKET,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ListeDeroulante } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { formaterDate } from '@/lib/format';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerTickets, type TicketListe } from '@/server/services/tickets-sav';

import { BadgeCouverture, BadgeTicket } from './badge-ticket';

export const metadata: Metadata = { title: 'SAV – HA-Gestion' };

const CHEMIN = '/sav';

const COLONNES: readonly Colonne<TicketListe>[] = [
  {
    libelle: 'Numéro',
    rendu: (t) => (
      <Link
        href={`/sav/tickets/${t.id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {t.numero}
      </Link>
    ),
  },
  {
    libelle: 'Patient',
    rendu: (t) => (t.patientMasque ? 'Autre centre' : (t.patient?.libelle ?? '—')),
  },
  { libelle: 'Appareil', rendu: (t) => t.numeroSerie },
  { libelle: 'Motif', rendu: (t) => LIBELLES_MOTIFS_SAV[t.motif] },
  { libelle: 'Centre', rendu: (t) => t.centre },
  { libelle: 'Ouvert le', rendu: (t) => formaterDate(t.dateOuverture) },
  { libelle: 'Couverture', rendu: (t) => <BadgeCouverture couverture={t.couverture} /> },
  { libelle: 'Statut', rendu: (t) => <BadgeTicket statut={t.statut} /> },
];

export default async function PageSAV({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  const { lignes, pagination, filtre } = await listerTickets(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="SAV" action={{ href: '/sav/nouveau', libelle: 'Nouveau ticket' }}>
        Réparations, garanties et prêts.
      </EntetePage>
      <FormulaireFiltres chemin={CHEMIN}>
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="statut"
          libelle="Statut"
          options={STATUTS_TICKET.map((s) => ({ valeur: s, libelle: LIBELLES_STATUTS_TICKET[s] }))}
          defaut={filtre.statut ?? ''}
          vide="Tous"
          requis={false}
        />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="motif"
          libelle="Motif"
          options={MOTIFS_SAV.map((m) => ({ valeur: m, libelle: LIBELLES_MOTIFS_SAV[m] }))}
          defaut={filtre.motif ?? ''}
          vide="Tous"
          requis={false}
        />
      </FormulaireFiltres>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(t) => t.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={parametres}
        vide="Aucun ticket."
      />
    </div>
  );
}
