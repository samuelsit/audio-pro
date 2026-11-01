import { centimes, formatEuros, LIBELLES_STATUTS_APPAREIL } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate, formaterDateHeure } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import {
  centresDeDestination,
  obtenirFicheAppareil,
  type MouvementAffiche,
} from '@/server/services/stock';

import { BadgeStatut } from '../../badge-statut';
import { ActionsAppareil } from './actions-appareil';
import { BlocGarantie } from './bloc-garantie';

export const metadata: Metadata = { title: 'Appareil – HA-Gestion' };

const LIBELLES_MOUVEMENT: Readonly<Record<MouvementAffiche['type'], string>> = {
  RECEPTION: 'Réception',
  CHANGEMENT_STATUT: 'Changement de statut',
  TRANSFERT: 'Transfert',
  ANNULATION_VENTE: 'Annulation de vente',
  ECHANGE: 'Échange',
};

const MENTION_PATIENT_MASQUE = 'Patient d’un autre centre';

function Information({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Statuts({ m }: { m: MouvementAffiche }) {
  const apres = LIBELLES_STATUTS_APPAREIL[m.statutApres];
  return m.statutAvant && m.statutAvant !== m.statutApres
    ? `${LIBELLES_STATUTS_APPAREIL[m.statutAvant]} → ${apres}`
    : apres;
}

function Centres({ m }: { m: MouvementAffiche }) {
  return m.centreAvant && m.centreAvant !== m.centreApres
    ? `${m.centreAvant} → ${m.centreApres}`
    : m.centreApres;
}

function Patient({ m }: { m: Pick<MouvementAffiche, 'patient' | 'patientMasque'> }) {
  if (m.patientMasque) {
    return <span className="text-muted-foreground">{MENTION_PATIENT_MASQUE}</span>;
  }
  return m.patient ? (
    <Link href={`/patients/${m.patient.id}`} className="underline underline-offset-2">
      {m.patient.libelle}
    </Link>
  ) : (
    '—'
  );
}

export default async function PageAppareil({ params }: PageProps<'/stock/appareils/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const fiche = await ouIntrouvable(obtenirFicheAppareil(acteur, id));
  const destinations = fiche.transferable ? await centresDeDestination(acteur, fiche.centreId) : [];
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre={fiche.numeroSerie}>
          {fiche.fabricant} – {fiche.modele}
        </EntetePage>
        <Button asChild variant="outline">
          <Link href={`/stock/appareils/${fiche.id}/modifier`}>Modifier</Link>
        </Button>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Information libelle="Statut">
          <BadgeStatut statut={fiche.statut} />
        </Information>
        <Information libelle="Centre">{fiche.centre}</Information>
        <Information libelle="Patient">
          <Patient m={fiche} />
        </Information>
        <Information libelle="Date de réception">{formaterDate(fiche.dateReception)}</Information>
        <Information libelle="Bon de livraison">{fiche.referenceBonLivraison}</Information>
        <Information libelle="Facture fabricant">
          {fiche.referenceFactureFabricant ?? '—'}
        </Information>
        <Information libelle="En consignation">{fiche.enConsignation ? 'Oui' : 'Non'}</Information>
        {fiche.voitPrix ? (
          <Information libelle="Prix d’achat">
            {fiche.prixAchatCentimes === null
              ? '—'
              : formatEuros(centimes(fiche.prixAchatCentimes))}
          </Information>
        ) : null}
        {fiche.parcPret ? <Information libelle="Parc de prêt">Oui</Information> : null}
        {fiche.remplacePar ? (
          <Information libelle="Remplacé par">
            <Link
              href={`/stock/appareils/${fiche.remplacePar.id}`}
              className="underline underline-offset-2"
            >
              {fiche.remplacePar.numeroSerie}
            </Link>
          </Information>
        ) : null}
        {fiche.remplace ? (
          <Information libelle="Remplace">
            <Link
              href={`/stock/appareils/${fiche.remplace.id}`}
              className="underline underline-offset-2"
            >
              {fiche.remplace.numeroSerie}
            </Link>
          </Information>
        ) : null}
      </dl>

      {fiche.garantie ? <BlocGarantie appareilId={fiche.id} garantie={fiche.garantie} /> : null}

      {/* Remonté après chaque mouvement : le panneau ouvert se referme. */}
      {fiche.dossierEssaiId ? (
        <p className="text-sm text-muted-foreground">
          Cet appareil est suivi par un essai : ses changements de statut passent par le{' '}
          <Link href={`/dossiers/${fiche.dossierEssaiId}`} className="underline underline-offset-4">
            dossier du patient
          </Link>
          .
        </p>
      ) : null}
      {fiche.ticketId ? (
        <p className="text-sm text-muted-foreground">
          Cet appareil est suivi par un{' '}
          <Link href={`/sav/tickets/${fiche.ticketId}`} className="underline underline-offset-4">
            ticket SAV
          </Link>
          .
        </p>
      ) : fiche.statut === 'VENDU' || fiche.statut === 'SAV' ? (
        <div>
          <Button asChild variant="outline">
            <Link href={`/sav/nouveau?serie=${fiche.numeroSerie}`}>Ouvrir un ticket SAV</Link>
          </Button>
        </div>
      ) : fiche.statut === 'EN_STOCK' && fiche.voitPrix ? (
        <div>
          <Button asChild variant="outline">
            <Link href={`/sav/retours/nouveau?appareil=${fiche.id}`}>Retour au fabricant</Link>
          </Button>
        </div>
      ) : null}
      <ActionsAppareil key={fiche.mouvements[0]?.id} fiche={fiche} destinations={destinations} />

      <section className="grid gap-2">
        <h2 className="font-medium">Historique</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date et heure</TableHead>
              <TableHead>Mouvement</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Dossier</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Motif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fiche.mouvements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap">
                  {formaterDateHeure(m.horodatage)}
                </TableCell>
                <TableCell>{LIBELLES_MOUVEMENT[m.type]}</TableCell>
                <TableCell>
                  <Statuts m={m} />
                </TableCell>
                <TableCell>
                  <Centres m={m} />
                </TableCell>
                <TableCell>
                  <Patient m={m} />
                </TableCell>
                <TableCell>{m.dossierId ?? '—'}</TableCell>
                <TableCell>{m.utilisateur}</TableCell>
                <TableCell className="max-w-xs break-words whitespace-normal">
                  {m.motif ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
