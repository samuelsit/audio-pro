import { LIBELLES_STATUTS_RETOUR } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerRetours, type RetourListe } from '@/server/services/retours-fabricant';

export const metadata: Metadata = { title: 'Retours fabricant – HA-Gestion' };

const COLONNES: readonly Colonne<RetourListe>[] = [
  {
    libelle: 'Numéro',
    rendu: (r) => (
      <Link
        href={`/sav/retours/${r.id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {r.numero}
      </Link>
    ),
  },
  { libelle: 'Fournisseur', rendu: (r) => r.fournisseur },
  { libelle: 'Appareil', rendu: (r) => r.numeroSerie ?? 'Produit non conforme' },
  { libelle: 'Centre', rendu: (r) => r.centre },
  { libelle: 'Envoyé le', rendu: (r) => formaterDate(r.dateEnvoi) },
  { libelle: 'Retour le', rendu: (r) => formaterDate(r.dateRetour) },
  {
    libelle: 'Statut',
    rendu: (r) => <Badge variant="outline">{LIBELLES_STATUTS_RETOUR[r.statut]}</Badge>,
  },
];

export default async function PageRetours({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  const { lignes, pagination } = await listerRetours(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Retours fabricant">Bons de retour, suivi et réception.</EntetePage>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(r) => r.id}
        pagination={pagination}
        chemin="/sav/retours"
        parametres={parametres}
        vide="Aucun retour."
      />
    </div>
  );
}
