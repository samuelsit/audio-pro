import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import { requireSuperadmin } from '@/server/auth/gardes';
import { listerQuotasPiles } from '@/server/services/quota-piles';

import { FormulaireQuotaPiles } from './formulaire-quota-piles';

export const metadata: Metadata = { title: 'Quota de piles – HA-Gestion' };

export default async function PageQuotaPiles() {
  const acteur = await requireSuperadmin();
  const quotas = await listerQuotasPiles(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Quota de piles">
        Boîtes remboursées par patient et par an, communes à tous les clients. Aucun texte déposé ne
        fixe ce quota : ne rien saisir sans la référence du texte. Il avertit sans bloquer.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Boîtes par an</TableHead>
            <TableHead>À partir du</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotas.map((q) => (
            <TableRow key={q.debut}>
              <TableCell>{q.boitesParAn}</TableCell>
              <TableCell>{formaterDate(q.debut)}</TableCell>
              <TableCell>{q.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FormulaireQuotaPiles />
    </div>
  );
}
