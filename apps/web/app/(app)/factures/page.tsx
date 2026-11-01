import {
  filtreFacturesSchema,
  formatEuros,
  LIBELLES_NATURES_PIECE,
  LIBELLES_STATUTS_FACTURE,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerFactures, type LigneFactureListee } from '@/server/services/facturation';

export const metadata: Metadata = { title: 'Factures – HA-Gestion' };

const CHEMIN = '/factures';

const COLONNES: readonly Colonne<LigneFactureListee>[] = [
  {
    libelle: 'Numéro',
    rendu: (l) => (
      <Link href={`${CHEMIN}/${l.id}`} className="underline underline-offset-2">
        {l.numero ?? 'Brouillon'}
      </Link>
    ),
  },
  { libelle: 'Pièce', rendu: (l) => LIBELLES_NATURES_PIECE[l.nature] },
  { libelle: 'Date', rendu: (l) => (l.dateFacture ? formaterDate(l.dateFacture) : '—') },
  { libelle: 'Patient', rendu: (l) => l.patient },
  { libelle: 'Centre', rendu: (l) => l.centre },
  { libelle: 'Total TTC', rendu: (l) => formatEuros(l.totalTTC) },
  {
    libelle: 'Statut',
    rendu: (l) => <Badge variant="secondary">{LIBELLES_STATUTS_FACTURE[l.statut]}</Badge>,
  },
];

/** La liste n'ouvre aucune pièce : pas de ligne READ (ADR-006). */
export default async function PageFactures({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { nature, statut } = filtreFacturesSchema.parse(parametres);
  const { lignes, pagination } = await listerFactures(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Factures">
        Factures et avoirs, numérotés par centre. Une vente directe s’ouvre depuis la fiche du
        patient.
      </EntetePage>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(l) => l.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={{ ...(nature ? { nature } : {}), ...(statut ? { statut } : {}) }}
        vide="Aucune facture."
      />
    </div>
  );
}
