import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
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
import { listerCentrales } from '@/server/services/fournisseurs';

export const metadata: Metadata = { title: 'Centrales d’achat – HA-Gestion' };

export default async function PageCentrales() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const centrales = await listerCentrales(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Centrales d’achat"
        action={{ href: '/admin/centrales/nouveau', libelle: 'Nouvelle centrale' }}
      >
        Elles regroupent la facturation dans un relevé mensuel, sans recevoir les commandes.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {centrales.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/admin/centrales/${c.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {c.nom}
                </Link>
              </TableCell>
              <TableCell>{c.email ?? '—'}</TableCell>
              <TableCell>
                {c.actif ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
