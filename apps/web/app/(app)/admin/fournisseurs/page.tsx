import { LIBELLES_TYPE_FOURNISSEUR } from '@ha/domain';
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
import { listerFournisseurs } from '@/server/services/fournisseurs';

export const metadata: Metadata = { title: 'Fournisseurs – HA-Gestion' };

export default async function PageFournisseurs() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const fournisseurs = await listerFournisseurs(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Fournisseurs"
        action={{ href: '/admin/fournisseurs/nouveau', libelle: 'Nouveau fournisseur' }}
      >
        Fabricants et fournisseurs à qui passer commande.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>E-mail de commande</TableHead>
            <TableHead>Centrale d’achat</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fournisseurs.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <Link
                  href={`/admin/fournisseurs/${f.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {f.nom}
                </Link>
              </TableCell>
              <TableCell>{LIBELLES_TYPE_FOURNISSEUR[f.type]}</TableCell>
              <TableCell>{f.emailCommande ?? '—'}</TableCell>
              <TableCell>{f.centraleAchat ?? '—'}</TableCell>
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
