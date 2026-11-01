import { formatEuros, peutRegulariserTiersPayant } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerRejets, type RejetListe } from '@/server/services/tiers-payant';

import { FormulaireResolution } from '../formulaires';

export const metadata: Metadata = { title: 'Rejets à traiter – HA-Gestion' };

const CHEMIN = '/tiers-payant/rejets';

export default async function PageRejets({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { lignes, pagination } = await listerRejets(acteur, perimetre, parametres);
  const regulariser = peutRegulariserTiersPayant(acteur.role);
  const colonnes: readonly Colonne<RejetListe>[] = [
    {
      libelle: 'Facture',
      rendu: (r) => (
        <Link
          href={`/tiers-payant/creances/${r.creanceId}`}
          className="underline underline-offset-2"
        >
          {r.numeroFacture} {r.type}
        </Link>
      ),
    },
    { libelle: 'Organisme', rendu: (r) => r.organisme },
    { libelle: 'Patient', rendu: (r) => r.patient },
    { libelle: 'Rejeté le', rendu: (r) => formaterDate(r.dateRejet) },
    { libelle: 'Code', rendu: (r) => r.code ?? '—' },
    { libelle: 'Motif', rendu: (r) => r.motif },
    { libelle: 'Solde', rendu: (r) => formatEuros(r.solde), className: 'text-right' },
    {
      libelle: 'Suite',
      rendu: (r) => <FormulaireResolution rejetId={r.id} regulariser={regulariser} />,
    },
  ];
  return (
    <div className="grid gap-6">
      <EntetePage titre="Rejets à traiter">
        Une créance rejetée reste due jusqu’à ce qu’on décide de sa suite.
      </EntetePage>
      <TableauPagine
        colonnes={colonnes}
        lignes={lignes}
        cleLigne={(r) => r.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={{}}
        vide="Aucun rejet à traiter."
      />
    </div>
  );
}
