import {
  calculerPagination,
  LIBELLES_STATUTS_APPAREIL,
  STATUTS_APPAREIL,
  type Pagination,
} from '@ha/domain';
import { Download, PackagePlus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ListeDeroulante, MessageFormulaire } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formaterDate } from '@/lib/format';
import type { EtatFormulaire } from '@/lib/formulaire';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { listerFabricants, listerModeles } from '@/server/services/catalogue';
import { LIGNES_PAR_PAGE_STOCK, listerStock, type LigneStock } from '@/server/services/stock';

import { BadgeStatut } from './badge-statut';

export const metadata: Metadata = { title: 'Stock – HA-Gestion' };

const CHEMIN = '/stock';
const FILTRES = ['statut', 'modeleId', 'fabricantId'] as const;

const COLONNES: readonly Colonne<LigneStock>[] = [
  {
    libelle: 'Numéro de série',
    rendu: (l) => (
      <Link href={`/stock/appareils/${l.id}`} className="font-mono underline underline-offset-2">
        {l.numeroSerie}
      </Link>
    ),
  },
  { libelle: 'Centre', rendu: (l) => l.centre },
  { libelle: 'Fabricant', rendu: (l) => l.fabricant },
  { libelle: 'Modèle', rendu: (l) => `${l.gamme} ${l.modele}` },
  { libelle: 'Statut', rendu: (l) => <BadgeStatut statut={l.statut} /> },
  { libelle: 'Réception', rendu: (l) => formaterDate(l.dateReception) },
  { libelle: 'Bon de livraison', rendu: (l) => l.referenceBonLivraison },
  { libelle: 'Consignation', rendu: (l) => (l.enConsignation ? 'Oui' : 'Non') },
];

export default async function PageStock({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const [modeles, fabricants] = await Promise.all([
    listerModeles(acteur),
    listerFabricants(acteur),
  ]);

  let lignes: LigneStock[] = [];
  let pagination: Pagination = calculerPagination(1, LIGNES_PAR_PAGE_STOCK, 0);
  const etat: EtatFormulaire = { valeurs: parametres };
  try {
    ({ lignes, pagination } = await listerStock(acteur, perimetre, parametres));
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) {
      throw erreur;
    }
    etat.message = 'Filtres invalides : corrigez-les pour afficher le stock.';
    etat.erreurs = erreur.erreurs;
  }
  const filtres = Object.fromEntries(
    FILTRES.flatMap((cle) => (parametres[cle] ? [[cle, parametres[cle]]] : [])),
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre="Stock">
          {perimetre.type === 'tous'
            ? 'Aides auditives de tous vos centres, au numéro de série.'
            : 'Aides auditives du centre courant, au numéro de série.'}
        </EntetePage>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/stock/accessoires">Accessoires et piles</Link>
          </Button>
          {etat.erreurs ? null : (
            <Button asChild variant="outline">
              {/* Lien de téléchargement (route GET), pas une navigation : <a> et non <Link>. */}
              <a href={urlAvecParametres(`${CHEMIN}/export`, filtres)} download>
                <Download aria-hidden />
                Exporter en CSV
              </a>
            </Button>
          )}
          <Button asChild>
            <Link href="/stock/reception">
              <PackagePlus aria-hidden />
              Réception
            </Link>
          </Button>
        </div>
      </div>

      <form action="/stock/recherche" className="grid max-w-md gap-1.5">
        <Label htmlFor="numero">Rechercher un numéro de série</Label>
        <div className="flex gap-2">
          <Input id="numero" name="numero" autoComplete="off" required />
          <Button type="submit" variant="outline">
            <Search aria-hidden />
            Rechercher
          </Button>
        </div>
      </form>

      <FormulaireFiltres chemin={CHEMIN}>
        <ListeDeroulante
          etat={etat}
          nom="statut"
          libelle="Statut"
          vide="Tous"
          requis={false}
          options={STATUTS_APPAREIL.map((s) => ({
            valeur: s,
            libelle: LIBELLES_STATUTS_APPAREIL[s],
          }))}
        />
        <ListeDeroulante
          etat={etat}
          nom="fabricantId"
          libelle="Fabricant"
          vide="Tous"
          requis={false}
          options={fabricants.map((f) => ({ valeur: f.id, libelle: f.nom }))}
        />
        <ListeDeroulante
          etat={etat}
          nom="modeleId"
          libelle="Modèle"
          vide="Tous"
          requis={false}
          options={modeles.map((m) => ({
            valeur: m.id,
            libelle: `${m.fabricant} – ${m.gamme} ${m.nom}`,
          }))}
        />
      </FormulaireFiltres>

      <MessageFormulaire etat={etat} />

      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(l) => l.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={filtres}
        vide="Aucun appareil ne correspond à ces filtres."
      />
    </div>
  );
}
