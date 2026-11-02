import { centimes, formatEuros, LIBELLES_SCENARIOS } from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { aujourdhui } from '@/server/services/patients';
import { syntheseSuivi } from '@/server/services/suivi-messages';

export const metadata: Metadata = { title: 'Relances – HA-Gestion' };

export default async function PageRelances({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const { mois: moisChoisi } = premieresValeurs(await searchParams);
  const mois = /^\d{4}-\d{2}$/.test(moisChoisi ?? '')
    ? (moisChoisi as string)
    : aujourdhui().slice(0, 7);
  const { lignes, couts } = await syntheseSuivi(acteur, perimetre, mois);

  return (
    <div className="grid gap-6">
      <EntetePage titre="Suivi des messages">
        Rappels, scénarios et campagnes du mois {mois}.
      </EntetePage>
      {lignes.length === 0 ? (
        <EtatVide titre="Aucun message ce mois-ci">
          Les scénarios s’activent dans Administration, Communication.
        </EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origine</TableHead>
              <TableHead>Envoyés</TableHead>
              <TableHead>Délivrés</TableHead>
              <TableHead>Échecs</TableHead>
              <TableHead>Clics</TableHead>
              <TableHead>Désinscriptions</TableHead>
              <TableHead>Non envoyés</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((l) => {
              const libelle =
                l.libelle.campagne ??
                (l.libelle.scenario
                  ? LIBELLES_SCENARIOS[l.libelle.scenario]
                  : 'Messages du centre');
              return (
                <TableRow key={libelle}>
                  <TableCell>{libelle}</TableCell>
                  <TableCell>{l.envoyes}</TableCell>
                  <TableCell>{l.delivres}</TableCell>
                  <TableCell>{l.echecs}</TableCell>
                  <TableCell>{l.clics}</TableCell>
                  <TableCell>{l.desinscriptions}</TableCell>
                  <TableCell>{l.bloques}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Coût des SMS par centre</h2>
        {couts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun SMS envoyé ce mois-ci.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Centre</TableHead>
                <TableHead>SMS</TableHead>
                <TableHead>Segments</TableHead>
                <TableHead>Coût</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {couts.map((c) => (
                <TableRow key={c.centre}>
                  <TableCell>{c.centre}</TableCell>
                  <TableCell>{c.messages}</TableCell>
                  <TableCell>{c.segments}</TableCell>
                  <TableCell>{formatEuros(centimes(c.coutCentimes))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
