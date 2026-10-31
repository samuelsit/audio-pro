import { LIBELLES_STATUTS_INVENTAIRE, peutGererInventaire } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDateHeure } from '@/lib/format';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerInventaires } from '@/server/services/inventaires';

import { ouvrirInventaireAction } from './actions';
import { FormulaireOuverture } from './formulaires-inventaire';

export const metadata: Metadata = { title: 'Inventaires – HA-Gestion' };

export default async function PageInventaires() {
  const { acteur, perimetre, centres } = await perimetreCourant();
  const inventaires = await listerInventaires(acteur, perimetre);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre="Inventaires">
          Pointage des appareils et comptage des accessoires, centre par centre.
        </EntetePage>
        <Button asChild variant="outline">
          <Link href="/stock">Retour au stock</Link>
        </Button>
      </div>
      {peutGererInventaire(acteur.role) ? (
        <FormulaireOuverture
          action={ouvrirInventaireAction}
          centres={centres}
          centreId={perimetre.type === 'centre' ? perimetre.centreId : undefined}
        />
      ) : null}
      {inventaires.length === 0 ? (
        <EtatVide titre="Aucun inventaire">Aucun inventaire dans ce périmètre.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Centre</TableHead>
              <TableHead>Ouvert le</TableHead>
              <TableHead>Clôturé le</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventaires.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link
                    href={`/stock/inventaires/${i.id}`}
                    className="underline underline-offset-2"
                  >
                    {i.centre}
                  </Link>
                </TableCell>
                <TableCell>{formaterDateHeure(i.ouvertLe)}</TableCell>
                <TableCell>{i.clotureLe ? formaterDateHeure(i.clotureLe) : '—'}</TableCell>
                <TableCell>{LIBELLES_STATUTS_INVENTAIRE[i.statut]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
