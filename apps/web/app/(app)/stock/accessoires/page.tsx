import { LIBELLES_NATURES_ACCESSOIRE } from '@ha/domain';
import { Download } from 'lucide-react';
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
import { perimetreCourant } from '@/server/auth/gardes';
import { listerStockAccessoires } from '@/server/services/stock';

export const metadata: Metadata = { title: 'Accessoires et piles – HA-Gestion' };

export default async function PageStockAccessoires() {
  const { acteur, perimetre } = await perimetreCourant();
  const lignes = await listerStockAccessoires(acteur, perimetre);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre="Accessoires et piles">Quantités en stock par centre.</EntetePage>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/stock">Aides auditives</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="/stock/accessoires/export" download>
              <Download aria-hidden />
              Exporter en CSV
            </a>
          </Button>
          <Button asChild>
            <Link href="/stock/accessoires/mouvement">Nouveau mouvement</Link>
          </Button>
        </div>
      </div>
      {lignes.length === 0 ? (
        <EtatVide titre="Aucun stock">Enregistrez une entrée pour commencer.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Centre</TableHead>
              <TableHead>Accessoire</TableHead>
              <TableHead>Nature</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((l) => (
              <TableRow key={`${l.centreId}-${l.accessoireId}`}>
                <TableCell>{l.centre}</TableCell>
                <TableCell>
                  <Link
                    href={`/stock/accessoires/${l.accessoireId}`}
                    className="underline underline-offset-2"
                  >
                    {l.accessoire}
                  </Link>
                </TableCell>
                <TableCell>{LIBELLES_NATURES_ACCESSOIRE[l.nature]}</TableCell>
                <TableCell className="text-right">{l.quantite}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
