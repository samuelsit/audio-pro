import { filtreReglementsSchema, formatEuros } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerComplementaires } from '@/server/services/complementaires';
import { aujourdhui } from '@/server/services/patients';
import { listerReglements, type ReglementListe } from '@/server/services/tiers-payant';

import { FormulaireReglement } from '../formulaires';

export const metadata: Metadata = { title: 'Règlements – HA-Gestion' };

const CHEMIN = '/tiers-payant/reglements';

const COLONNES: readonly Colonne<ReglementListe>[] = [
  {
    libelle: 'Référence',
    rendu: (r) => (
      <Link href={`${CHEMIN}/${r.id}`} className="underline underline-offset-2">
        {r.reference}
      </Link>
    ),
  },
  { libelle: 'Date', rendu: (r) => formaterDate(r.dateReglement) },
  { libelle: 'Organisme', rendu: (r) => r.organisme },
  { libelle: 'Centre', rendu: (r) => r.centre },
  { libelle: 'Part AMO', rendu: (r) => formatEuros(r.partAmo), className: 'text-right' },
  { libelle: 'Part AMC', rendu: (r) => formatEuros(r.partAmc), className: 'text-right' },
  { libelle: 'Reste à lettrer', rendu: (r) => formatEuros(r.reste), className: 'text-right' },
  {
    libelle: 'État',
    rendu: (r) => (r.annule ? <Badge variant="secondary">Annulé</Badge> : null),
  },
];

export default async function PageReglements({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { aLettrer } = filtreReglementsSchema.parse(parametres);
  const [{ lignes, pagination }, complementaires] = await Promise.all([
    listerReglements(acteur, perimetre, parametres),
    listerComplementaires(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Règlements">
        Virements reçus des organismes, lettrés sur leurs créances.
      </EntetePage>
      {perimetre.type === 'centre' ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">Saisir un virement reçu</summary>
          <div className="mt-3">
            <FormulaireReglement
              centreId={perimetre.centreId}
              jour={aujourdhui()}
              complementaires={complementaires}
            />
          </div>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sélectionnez un centre pour saisir un virement : il entre dans la chaîne de ce centre.
        </p>
      )}
      <div>
        <Button asChild variant="outline">
          <Link href={aLettrer ? CHEMIN : `${CHEMIN}?aLettrer=oui`}>
            {aLettrer ? 'Tous les règlements' : 'Seulement ceux à lettrer'}
          </Link>
        </Button>
      </div>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(r) => r.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={aLettrer ? { aLettrer: 'oui' } : {}}
        vide="Aucun règlement."
      />
    </div>
  );
}
