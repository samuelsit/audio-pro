import { formatEuros } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerImpayes, type CreanceListee } from '@/server/services/tiers-payant';

import { BoutonRelance } from '../formulaires';

export const metadata: Metadata = { title: 'Impayés à relancer – HA-Gestion' };

const CHEMIN = '/tiers-payant/impayes';

const COLONNES: readonly Colonne<CreanceListee>[] = [
  {
    libelle: 'Facture',
    rendu: (c) => (
      <Link href={`/tiers-payant/creances/${c.id}`} className="underline underline-offset-2">
        {c.numeroFacture} {c.type}
      </Link>
    ),
  },
  { libelle: 'Organisme', rendu: (c) => c.organisme },
  { libelle: 'Patient', rendu: (c) => c.patient },
  { libelle: 'Échéance', rendu: (c) => formaterDate(c.echeanceAttendue) },
  { libelle: 'Solde', rendu: (c) => formatEuros(c.solde), className: 'text-right' },
  {
    libelle: 'Dernière relance',
    rendu: (c) => (c.derniereRelanceLe ? formaterDate(c.derniereRelanceLe) : '—'),
  },
  { libelle: 'Relance', rendu: (c) => <BoutonRelance creanceId={c.id} /> },
];

export default async function PageImpayes({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { lignes, pagination } = await listerImpayes(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Impayés à relancer">
        Créances échues, de la plus en retard à la plus récente. Les rejets se traitent à part.
      </EntetePage>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(c) => c.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={{}}
        vide="Aucun impayé."
      />
    </div>
  );
}
