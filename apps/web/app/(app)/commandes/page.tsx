import { centimes, formatEuros, LIBELLES_STATUTS_COMMANDE, STATUTS_COMMANDE } from '@ha/domain';
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
import { listerCommandes, type CommandeListee } from '@/server/services/commandes';
import { listerFournisseurs } from '@/server/services/fournisseurs';

import { BadgeStatutCommande } from './badge-statut';

export const metadata: Metadata = { title: 'Commandes – HA-Gestion' };

const CHEMIN = '/commandes';

const COLONNES: readonly Colonne<CommandeListee>[] = [
  {
    libelle: 'Numéro',
    rendu: (c) => (
      <Link href={`/commandes/${c.id}`} className="font-medium underline-offset-4 hover:underline">
        {c.numero}
      </Link>
    ),
  },
  { libelle: 'Fournisseur', rendu: (c) => c.fournisseur },
  { libelle: 'Centre', rendu: (c) => c.centre },
  { libelle: 'Créée le', rendu: (c) => formaterDate(c.createdAt.toISOString().slice(0, 10)) },
  { libelle: 'Statut', rendu: (c) => <BadgeStatutCommande statut={c.statut} /> },
  {
    libelle: 'Montant',
    className: 'text-right',
    rendu: (c) => (c.montantCentimes === null ? '—' : formatEuros(centimes(c.montantCentimes))),
  },
];

export default async function PageCommandes({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  const [{ lignes, pagination, filtre }, fournisseurs] = await Promise.all([
    listerCommandes(acteur, perimetre, parametres),
    listerFournisseurs(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Commandes"
        action={{ href: '/commandes/nouvelle', libelle: 'Nouvelle demande' }}
      >
        Demandes et commandes aux fabricants et fournisseurs.
      </EntetePage>
      <FormulaireFiltres chemin={CHEMIN}>
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="statut"
          libelle="Statut"
          options={STATUTS_COMMANDE.map((s) => ({
            valeur: s,
            libelle: LIBELLES_STATUTS_COMMANDE[s],
          }))}
          defaut={filtre.statut ?? ''}
          vide="Tous"
          requis={false}
        />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="fournisseurId"
          libelle="Fournisseur"
          options={fournisseurs.map((f) => ({ valeur: f.id, libelle: f.nom }))}
          defaut={filtre.fournisseurId ?? ''}
          vide="Tous"
          requis={false}
        />
      </FormulaireFiltres>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(c) => c.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={parametres}
        vide="Aucune commande."
      />
    </div>
  );
}
