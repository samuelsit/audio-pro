import {
  centimes,
  formatEuros,
  LIBELLES_ORIGINE_FACTURE,
  LIBELLES_STATUT_FACTURE_FOURNISSEUR,
  peutGererAchats,
  STATUTS_FACTURE_FOURNISSEUR,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { ListeDeroulante } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { formaterDate } from '@/lib/format';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import {
  listerFacturesFournisseur,
  type FactureListee,
} from '@/server/services/factures-fournisseurs';

import { FormulaireDepot } from './formulaires';

export const metadata: Metadata = { title: 'Factures fournisseurs – HA-Gestion' };

const CHEMIN = '/commandes/factures';

const COLONNES: readonly Colonne<FactureListee>[] = [
  {
    libelle: 'Numéro',
    rendu: (f) => (
      <Link
        href={`/commandes/factures/${f.id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {f.numero ?? 'Sans numéro'}
      </Link>
    ),
  },
  { libelle: 'Fournisseur', rendu: (f) => f.fournisseur ?? 'À choisir' },
  { libelle: 'Centre', rendu: (f) => f.centre ?? 'À choisir' },
  {
    libelle: 'Date',
    rendu: (f) => (f.dateFacture ? formaterDate(f.dateFacture.toISOString().slice(0, 10)) : '—'),
  },
  { libelle: 'Origine', rendu: (f) => LIBELLES_ORIGINE_FACTURE[f.origine] },
  {
    libelle: 'Statut',
    rendu: (f) => (
      <span className="flex flex-wrap gap-1">
        <Badge variant="secondary">{LIBELLES_STATUT_FACTURE_FOURNISSEUR[f.statut]}</Badge>
        {f.expediteurInconnu ? <Badge variant="outline">Expéditeur inconnu</Badge> : null}
      </span>
    ),
  },
  {
    libelle: 'Total TTC',
    className: 'text-right',
    rendu: (f) =>
      f.montantTtcCentimes === null ? '—' : formatEuros(centimes(f.montantTtcCentimes)),
  },
];

export default async function PageFacturesFournisseur({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  if (!peutGererAchats(acteur.role)) {
    redirect('/commandes');
  }
  const { lignes, pagination, filtre } = await listerFacturesFournisseur(
    acteur,
    perimetre,
    parametres,
  );
  return (
    <div className="grid gap-6">
      <EntetePage titre="Factures fournisseurs">
        Factures reçues, à vérifier et à rapprocher des commandes. Aucune ne se valide seule.
      </EntetePage>
      <FormulaireDepot />
      <FormulaireFiltres chemin={CHEMIN}>
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="statut"
          libelle="Statut"
          options={STATUTS_FACTURE_FOURNISSEUR.map((s) => ({
            valeur: s,
            libelle: LIBELLES_STATUT_FACTURE_FOURNISSEUR[s],
          }))}
          defaut={filtre.statut ?? ''}
          vide="Tous"
          requis={false}
        />
      </FormulaireFiltres>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(f) => f.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={parametres}
        vide="Aucune facture."
      />
    </div>
  );
}
