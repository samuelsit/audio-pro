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
import { listerPraticiens } from '@/server/services/praticiens';

export const metadata: Metadata = { title: 'Praticiens – HA-Gestion' };

export default async function PagePraticiens() {
  const { acteur, perimetre } = await perimetreCourant();
  const praticiens = await listerPraticiens(acteur, perimetre);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Praticiens"
        action={{ href: '/admin/praticiens/nouveau', libelle: 'Nouvelle fiche praticien' }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>RPPS</TableHead>
            <TableHead>ADELI</TableHead>
            <TableHead>Centres d’exercice</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {praticiens.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link
                  href={`/admin/praticiens/${p.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {p.prenom} {p.nom}
                </Link>
              </TableCell>
              <TableCell className="font-mono">{p.rpps}</TableCell>
              <TableCell className="font-mono">{p.adeli ?? '—'}</TableCell>
              <TableCell>{p.centres.map((c) => c.nom).join(', ')}</TableCell>
              <TableCell>
                {p.actif ? (
                  <Badge>Actif</Badge>
                ) : (
                  <Badge variant="secondary">Compte désactivé</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
