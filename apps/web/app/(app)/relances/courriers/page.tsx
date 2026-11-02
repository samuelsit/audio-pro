import { LIBELLES_STATUTS_LOT, LIBELLES_TYPES_LOT } from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { centresSelectionnables } from '@/server/auth/acces';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerLots } from '@/server/services/courriers';

import { comptesRendusAction, marquerImprimeAction } from '../actions';
import { FormulaireComptesRendus } from '../formulaires';

export const metadata: Metadata = { title: 'Courriers – HA-Gestion' };

export default async function PageCourriers() {
  const { acteur, perimetre } = await perimetreCourant();
  const [lots, centres] = await Promise.all([
    listerLots(acteur, perimetre),
    centresSelectionnables(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Courriers">Lots à imprimer, avec l’en-tête du centre.</EntetePage>
      {lots.length === 0 ? (
        <EtatVide titre="Aucun lot">Les lettres des campagnes et scénarios arrivent ici.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Centre</TableHead>
              <TableHead>Nature</TableHead>
              <TableHead>Lettres</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.centre}</TableCell>
                <TableCell>{LIBELLES_TYPES_LOT[l.type]}</TableCell>
                <TableCell>{l.lettres}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{LIBELLES_STATUTS_LOT[l.statut]}</Badge>
                </TableCell>
                <TableCell className="flex gap-2">
                  {l.statut === 'A_GENERER' ? null : (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/relances/courriers/${l.id}`}>Télécharger</a>
                    </Button>
                  )}
                  {l.statut === 'PRET' ? (
                    <form action={marquerImprimeAction.bind(null, l.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Marquer imprimé
                      </Button>
                    </form>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Comptes rendus au prescripteur</h2>
        <FormulaireComptesRendus action={comptesRendusAction} centres={centres} />
      </section>
    </div>
  );
}
