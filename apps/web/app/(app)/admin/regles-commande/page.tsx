import { centimes, formatEuros, LIBELLES_DECISION_REGLE, LIBELLES_TYPE_PRODUIT } from '@ha/domain';
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
import { listerReglesCommande } from '@/server/services/regles-commande';

export const metadata: Metadata = { title: 'Règles de commande – HA-Gestion' };

export default async function PageReglesCommande() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const regles = await listerReglesCommande(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Règles de commande"
        action={{ href: '/admin/regles-commande/nouvelle', libelle: 'Nouvelle règle' }}
      >
        La première règle active qui correspond décide. Sans règle, ou si un prix manque, la
        commande attend une approbation.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Priorité</TableHead>
            <TableHead>Règle</TableHead>
            <TableHead>Montant maximal</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Fournisseur</TableHead>
            <TableHead>Centre</TableHead>
            <TableHead>Décision</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {regles.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.priorite}</TableCell>
              <TableCell>
                <Link
                  href={`/admin/regles-commande/${r.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {r.libelle}
                </Link>
              </TableCell>
              <TableCell>
                {r.montantMaxCentimes === null
                  ? 'Tous'
                  : formatEuros(centimes(r.montantMaxCentimes))}
              </TableCell>
              <TableCell>{r.typeProduit ? LIBELLES_TYPE_PRODUIT[r.typeProduit] : 'Tous'}</TableCell>
              <TableCell>{r.fournisseur ?? 'Tous'}</TableCell>
              <TableCell>{r.centre ?? 'Tous'}</TableCell>
              <TableCell>{LIBELLES_DECISION_REGLE[r.decision]}</TableCell>
              <TableCell>
                {r.actif ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
