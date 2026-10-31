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
import { listerFabricants } from '@/server/services/catalogue';

export const metadata: Metadata = { title: 'Fabricants – HA-Gestion' };

export default async function PageFabricants() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const fabricants = await listerFabricants(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Fabricants"
        action={{ href: '/admin/fabricants/nouveau', libelle: 'Nouveau fabricant' }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fabricants.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <Link
                  href={`/admin/fabricants/${f.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {f.nom}
                </Link>
              </TableCell>
              <TableCell>
                {f.actif ? <Badge>Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
