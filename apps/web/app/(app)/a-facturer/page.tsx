import {
  ETATS_FACTURE,
  LIBELLES_ETATS_FACTURE,
  filtreAFacturerSchema,
  formatEuros,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerAFacturer, type LigneAFacturer } from '@/server/services/factures';

import { ListeConstats } from '../dossiers/[id]/liste-constats';

export const metadata: Metadata = { title: 'À facturer – HA-Gestion' };

const CHEMIN = '/a-facturer';

const montant = (valeur: LigneAFacturer['prixTTC']) =>
  valeur === null ? '—' : formatEuros(valeur);

const COLONNES: readonly Colonne<LigneAFacturer>[] = [
  {
    libelle: 'Patient',
    rendu: (l) => (
      <Link href={`/dossiers/${l.dossierId}`} className="underline underline-offset-2">
        {l.patient}
      </Link>
    ),
  },
  { libelle: 'Centre', rendu: (l) => l.centre },
  { libelle: 'Délivrance', rendu: (l) => formaterDate(l.dateDelivrance) },
  { libelle: 'Prix TTC', rendu: (l) => montant(l.prixTTC) },
  { libelle: 'Reste à charge', rendu: (l) => montant(l.resteACharge) },
  {
    libelle: 'Motifs',
    rendu: (l) =>
      l.erreurs.length > 0 ? (
        <ListeConstats constats={l.erreurs} />
      ) : (
        <span className="text-muted-foreground">
          {l.avertissements.length > 0
            ? `${String(l.avertissements.length)} avertissement(s)`
            : 'Aucun'}
        </span>
      ),
  },
];

/** La file n'ouvre aucun dossier : pas de ligne READ (ADR-006). */
export default async function PageAFacturer({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { etat } = filtreAFacturerSchema.parse(parametres);
  const { lignes, pagination, compteurs } = await listerAFacturer(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="À facturer">
        {perimetre.type === 'tous'
          ? 'Dossiers de tout le périmètre prêts à être facturés.'
          : 'Dossiers du centre courant prêts à être facturés.'}
      </EntetePage>
      <nav aria-label="État des dossiers" className="flex flex-wrap gap-2">
        {ETATS_FACTURE.map((valeur) => (
          <Button key={valeur} asChild variant={valeur === etat ? 'default' : 'outline'}>
            <Link
              href={`${CHEMIN}?etat=${valeur}`}
              aria-current={valeur === etat ? 'page' : undefined}
            >
              {LIBELLES_ETATS_FACTURE[valeur]} ({compteurs[valeur]})
            </Link>
          </Button>
        ))}
      </nav>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(l) => l.dossierId}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={{ etat }}
        vide={etat === 'PRET' ? 'Aucun dossier prêt.' : 'Aucun dossier bloqué.'}
      />
    </div>
  );
}
