import { SystemClock } from '@ha/adapters';
import { centimes, formatEuros, LIBELLES_TYPE_ECART, peutGererAchats } from '@ha/domain';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { ChampTexte, ListeDeroulante } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerFournisseurs } from '@/server/services/fournisseurs';
import { statistiquesAchats } from '@/server/services/statistiques-achats';

export const metadata: Metadata = { title: 'Statistiques d’achats – HA-Gestion' };

const CHEMIN = '/commandes/statistiques';

export default async function PageStatistiquesAchats({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const jour = new SystemClock().now().slice(0, 10);
  const valeurs = {
    du: `${jour.slice(0, 7)}-01`,
    au: jour,
    ...premieresValeurs(await searchParams),
  };
  const { acteur, perimetre } = await perimetreCourant();
  if (!peutGererAchats(acteur.role)) {
    redirect('/commandes');
  }
  const [stats, fournisseurs] = await Promise.all([
    statistiquesAchats(acteur, perimetre, valeurs),
    listerFournisseurs(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Statistiques d’achats">
        Achats datés à la facture validée, délais à l’envoi de la commande.
      </EntetePage>
      <FormulaireFiltres chemin={CHEMIN}>
        <ChampTexte
          etat={ETAT_INITIAL}
          nom="du"
          libelle="Du"
          type="date"
          defaut={stats.filtre.du}
          requis
        />
        <ChampTexte
          etat={ETAT_INITIAL}
          nom="au"
          libelle="Au"
          type="date"
          defaut={stats.filtre.au}
          requis
        />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="fournisseurId"
          libelle="Fournisseur"
          options={fournisseurs.map((f) => ({ valeur: f.id, libelle: f.nom }))}
          defaut={stats.filtre.fournisseurId ?? ''}
          vide="Tous"
          requis={false}
        />
      </FormulaireFiltres>
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            Achats : {formatEuros(centimes(stats.totalHtCentimes))} HT
          </h2>
          <Button asChild variant="outline" size="sm">
            <a href={urlAvecParametres(`${CHEMIN}/export`, valeurs)}>Exporter en CSV</a>
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead className="text-right">Factures</TableHead>
              <TableHead className="text-right">Montant HT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.achats.map((l) => (
              <TableRow key={`${l.fournisseur}-${l.centre}`}>
                <TableCell>{l.fournisseur}</TableCell>
                <TableCell>{l.centre}</TableCell>
                <TableCell className="text-right">{l.factures}</TableCell>
                <TableCell className="text-right">
                  {formatEuros(centimes(l.montantHtCentimes))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="grid gap-2">
        <h2 className="font-medium">Délais de livraison</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead className="text-right">Commandes livrées</TableHead>
              <TableHead className="text-right">Délai moyen (jours)</TableHead>
              <TableHead className="text-right">Délai maximal (jours)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.delais.map((l) => (
              <TableRow key={l.fournisseur}>
                <TableCell>{l.fournisseur}</TableCell>
                <TableCell className="text-right">{l.commandes}</TableCell>
                <TableCell className="text-right">
                  {l.delaiMoyenJours.toLocaleString('fr-FR')}
                </TableCell>
                <TableCell className="text-right">{l.delaiMaxJours}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="grid gap-2">
        <h2 className="font-medium">Écarts</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">À traiter</TableHead>
              <TableHead className="text-right">Traités</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.ecarts.map((l) => (
              <TableRow key={l.type}>
                <TableCell>{LIBELLES_TYPE_ECART[l.type]}</TableCell>
                <TableCell className="text-right">{l.ouverts}</TableCell>
                <TableCell className="text-right">{l.traites}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
