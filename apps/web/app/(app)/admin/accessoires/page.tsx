import {
  centimes,
  ENTETES_CSV_ACCESSOIRES,
  formatEuros,
  LIBELLES_NATURES_ACCESSOIRE,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ImportCsv } from '@/components/import-csv';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireRole } from '@/server/auth/gardes';
import { listerAccessoires } from '@/server/services/catalogue';

import { importerAccessoiresAction } from './actions';

export const metadata: Metadata = { title: 'Accessoires et piles – HA-Gestion' };

export default async function PageAccessoires() {
  const acteur = await requireRole('ADMIN');
  const accessoires = await listerAccessoires(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Accessoires et piles"
        action={{ href: '/admin/accessoires/nouveau', libelle: 'Nouvel accessoire' }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Nature</TableHead>
            <TableHead>Code LPP</TableHead>
            <TableHead className="text-right">Prix</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accessoires.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link
                  href={`/admin/accessoires/${a.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {a.nom}
                </Link>
              </TableCell>
              <TableCell>{LIBELLES_NATURES_ACCESSOIRE[a.nature]}</TableCell>
              <TableCell className="font-mono">{a.codeLpp ?? '—'}</TableCell>
              <TableCell className="text-right">{formatEuros(centimes(a.prixCentimes))}</TableCell>
              <TableCell>
                {a.actif ? <Badge>Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ImportCsv
        action={importerAccessoiresAction}
        colonnes={ENTETES_CSV_ACCESSOIRES}
        id="fichier-accessoires"
      />
    </div>
  );
}
