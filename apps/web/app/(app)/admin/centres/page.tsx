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
import { perimetreCourant } from '@/server/auth/gardes';
import { listerCentres } from '@/server/services/centres';

export const metadata: Metadata = { title: 'Centres – HA-Gestion' };

export default async function PageCentres() {
  const { acteur, perimetre } = await perimetreCourant();
  const centres = await listerCentres(acteur, perimetre);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Centres"
        action={{ href: '/admin/centres/nouveau', libelle: 'Nouveau centre' }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Ville</TableHead>
            <TableHead>FINESS</TableHead>
            <TableHead>N° facturation AM</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {centres.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/admin/centres/${c.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {c.nom}
                </Link>
              </TableCell>
              <TableCell>
                {c.codePostal} {c.ville}
              </TableCell>
              <TableCell className="font-mono">{c.finess ?? '—'}</TableCell>
              <TableCell className="font-mono">{c.numeroFacturationAm ?? '—'}</TableCell>
              <TableCell>
                {c.actif ? <Badge>Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
