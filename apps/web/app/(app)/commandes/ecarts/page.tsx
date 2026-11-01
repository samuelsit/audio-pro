import {
  centimes,
  ecartTraitable,
  formatEuros,
  LIBELLES_STATUT_ECART,
  LIBELLES_TYPE_ECART,
  peutGererAchats,
  STATUTS_ECART_ACHAT,
  TYPES_ECART_ACHAT,
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
import { listerEcarts, type EcartListe } from '@/server/services/ecarts-achat';

import { traiterEcartAction } from '../actions';
import { FormulaireEcart } from '../formulaires';

export const metadata: Metadata = { title: 'Écarts – HA-Gestion' };

const CHEMIN = '/commandes/ecarts';

function constat(e: EcartListe): string {
  if (e.montantAttenduCentimes !== null && e.montantConstateCentimes !== null) {
    return `${formatEuros(centimes(e.montantAttenduCentimes))} attendu, ${formatEuros(centimes(e.montantConstateCentimes))} constaté`;
  }
  if (e.quantiteAttendue !== null && e.quantiteConstatee !== null) {
    return `${String(e.quantiteAttendue)} attendu, ${String(e.quantiteConstatee)} constaté`;
  }
  return e.numeroSerie ?? '—';
}

const COLONNES: readonly Colonne<EcartListe>[] = [
  { libelle: 'Date', rendu: (e) => formaterDate(e.createdAt.toISOString().slice(0, 10)) },
  { libelle: 'Écart', rendu: (e) => LIBELLES_TYPE_ECART[e.type] },
  {
    libelle: 'Commande',
    rendu: (e) =>
      e.commandeId ? (
        <Link href={`/commandes/${e.commandeId}`} className="underline-offset-4 hover:underline">
          {e.commande}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    libelle: 'Facture',
    rendu: (e) =>
      e.factureFournisseurId ? (
        <Link
          href={`/commandes/factures/${e.factureFournisseurId}`}
          className="underline-offset-4 hover:underline"
        >
          {e.facture}
        </Link>
      ) : (
        '—'
      ),
  },
  { libelle: 'Centre', rendu: (e) => e.centre },
  { libelle: 'Constat', rendu: constat },
  { libelle: 'Commentaire', rendu: (e) => e.commentaire ?? '—' },
  {
    libelle: 'Statut',
    rendu: (e) => <Badge variant="secondary">{LIBELLES_STATUT_ECART[e.statut]}</Badge>,
  },
  {
    libelle: 'Traitement',
    rendu: (e) =>
      ecartTraitable(e.statut) ? (
        <div className="grid gap-2">
          <FormulaireEcart action={traiterEcartAction.bind(null, e.id)} ecartId={e.id} />
          {e.type === 'PRODUIT_NON_CONFORME' ? (
            <Link href={`/sav/retours/nouveau?ecart=${e.id}`} className="text-sm underline">
              Préparer un bon de retour
            </Link>
          ) : null}
        </div>
      ) : null,
  },
];

export default async function PageEcarts({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  if (!peutGererAchats(acteur.role)) {
    redirect('/commandes');
  }
  const { lignes, pagination, filtre } = await listerEcarts(acteur, perimetre, {
    statut: 'OUVERT',
    ...parametres,
  });
  return (
    <div className="grid gap-6">
      <EntetePage titre="Écarts">
        Écarts relevés à la réception et au rapprochement des factures.
      </EntetePage>
      <FormulaireFiltres chemin={CHEMIN}>
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="statut"
          libelle="Statut"
          options={STATUTS_ECART_ACHAT.map((s) => ({
            valeur: s,
            libelle: LIBELLES_STATUT_ECART[s],
          }))}
          defaut={filtre.statut ?? ''}
          vide="Tous"
          requis={false}
        />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="type"
          libelle="Type"
          options={TYPES_ECART_ACHAT.map((t) => ({ valeur: t, libelle: LIBELLES_TYPE_ECART[t] }))}
          defaut={filtre.type ?? ''}
          vide="Tous"
          requis={false}
        />
      </FormulaireFiltres>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(e) => e.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={parametres}
        vide="Aucun écart."
      />
    </div>
  );
}
