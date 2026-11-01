import { LIBELLES_STATUTS_RETOUR } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EntetePage } from '@/components/entete-page';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerModeles } from '@/server/services/catalogue';
import { aujourdhui } from '@/server/services/patients';
import { obtenirRetour } from '@/server/services/retours-fabricant';

import {
  ActionAnnulerRetour,
  FormulaireEchangeStock,
  FormulaireEnvoi,
  FormulaireIssue,
} from '../../formulaires';

export const metadata: Metadata = { title: 'Retour fabricant – HA-Gestion' };

function Information({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function PageRetour({ params }: PageProps<'/sav/retours/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const retour = await ouIntrouvable(obtenirRetour(acteur, id));
  const echangeStock = retour.sourceStock && retour.statut === 'ENVOYE';
  const modeles = echangeStock ? await listerModeles(acteur) : [];
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre={retour.numero}>{retour.fournisseur}</EntetePage>
        <Button asChild variant="outline">
          <a href={`/sav/retours/${retour.id}/bon`} target="_blank" rel="noreferrer">
            Bon de retour
          </a>
        </Button>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Information libelle="Statut">{LIBELLES_STATUTS_RETOUR[retour.statut]}</Information>
        <Information libelle="Appareil">{retour.numeroSerie ?? 'Produit non conforme'}</Information>
        <Information libelle="Centre">{retour.centre}</Information>
        <Information libelle="Bon du">{formaterDate(retour.dateBon)}</Information>
        <Information libelle="Envoyé le">{formaterDate(retour.dateEnvoi)}</Information>
        <Information libelle="Retour le">{formaterDate(retour.dateRetour)}</Information>
        <Information libelle="Transporteur">{retour.transporteur ?? '—'}</Information>
        <Information libelle="Numéro de suivi">{retour.numeroSuivi ?? '—'}</Information>
        <Information libelle="Ticket">
          {retour.ticketId ? (
            <Link href={`/sav/tickets/${retour.ticketId}`} className="underline underline-offset-2">
              Voir le ticket
            </Link>
          ) : (
            '—'
          )}
        </Information>
      </dl>
      {retour.statut === 'PREPARE' ? (
        <>
          <FormulaireEnvoi retourId={retour.id} jour={aujourdhui()} />
          <ActionAnnulerRetour retourId={retour.id} />
        </>
      ) : null}
      {retour.statut === 'ENVOYE' && retour.numeroSerie !== null ? (
        <FormulaireIssue retourId={retour.id} />
      ) : null}
      {echangeStock ? (
        <FormulaireEchangeStock
          retourId={retour.id}
          modeles={modeles
            .filter((m) => m.actif)
            .map((m) => ({ id: m.id, libelle: `${m.fabricant} ${m.gamme} ${m.nom}` }))}
          modeleId={retour.modeleId ?? ''}
        />
      ) : null}
    </div>
  );
}
