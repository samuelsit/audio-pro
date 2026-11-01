import { centimes, formatEuros, LIBELLES_POINTAGE_RELEVE } from '@ha/domain';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import type { LigneReleveVue } from '@/server/services/releves-centrale';

export function LignesReleve({ lignes }: { lignes: readonly LigneReleveVue[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Facture</TableHead>
          <TableHead>Fournisseur</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Montant TTC</TableHead>
          <TableHead>Pointage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lignes.map((l) => (
          <TableRow key={l.rang}>
            <TableCell>
              {l.factureFournisseurId ? (
                <Link
                  href={`/commandes/factures/${l.factureFournisseurId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {l.numeroFacture}
                </Link>
              ) : (
                l.numeroFacture
              )}
            </TableCell>
            <TableCell>{l.fournisseur}</TableCell>
            <TableCell>{formaterDate(l.dateFacture)}</TableCell>
            <TableCell className="text-right">
              {formatEuros(centimes(l.montantTtcCentimes))}
            </TableCell>
            <TableCell>
              <Badge variant={l.etat === 'POINTEE' ? 'secondary' : 'default'}>
                {LIBELLES_POINTAGE_RELEVE[l.etat]}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
