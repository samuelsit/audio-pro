import type { Metadata } from 'next';
import Link from 'next/link';

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
import { requireRole } from '@/server/auth/gardes';
import { listerReleves } from '@/server/services/releves-centrale';

export const metadata: Metadata = { title: 'Relevés de centrale – HA-Gestion' };

export default async function PageReleves() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const releves = await listerReleves(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Relevés de centrale"
        action={{ href: '/commandes/releves/nouveau', libelle: 'Importer un relevé' }}
      >
        Le relevé mensuel d’une centrale, pointé sur les factures qu’il regroupe.
      </EntetePage>
      {releves.length === 0 ? (
        <EtatVide titre="Aucun relevé">Importez le premier relevé mensuel.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mois</TableHead>
              <TableHead>Centrale</TableHead>
              <TableHead className="text-right">Lignes</TableHead>
              <TableHead className="text-right">À regarder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {releves.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/commandes/releves/${r.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.mois}
                  </Link>
                </TableCell>
                <TableCell>{r.centrale}</TableCell>
                <TableCell className="text-right">{r.lignes}</TableCell>
                <TableCell className="text-right">{r.ecarts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
