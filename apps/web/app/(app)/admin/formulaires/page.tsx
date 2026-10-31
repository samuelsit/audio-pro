import { LIBELLES_NATURES_FORMULAIRE } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireRole } from '@/server/auth/gardes';
import { listerModeles } from '@/server/services/modeles-formulaire';

import { basculerModeleAction } from './actions';

export const metadata: Metadata = { title: 'Formulaires cliniques – HA-Gestion' };

export default async function PageFormulaires() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const modeles = await listerModeles(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Formulaires cliniques"
        action={{ href: '/admin/formulaires/nouveau', libelle: 'Nouveau formulaire' }}
      >
        Anamnèse et questionnaires. Modifier un formulaire crée une version : les réponses déjà
        saisies gardent la leur.
      </EntetePage>
      {modeles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Les formulaires livrés apparaissent au premier bilan.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Nature</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>État</TableHead>
              <TableHead>
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modeles.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link
                    href={`/admin/formulaires/${m.code}`}
                    className="font-medium hover:underline"
                  >
                    {m.nom}
                  </Link>
                </TableCell>
                <TableCell>{LIBELLES_NATURES_FORMULAIRE[m.nature]}</TableCell>
                <TableCell>{m.version}</TableCell>
                <TableCell>
                  <Badge variant={m.actif ? 'default' : 'outline'}>
                    {m.actif ? 'Proposé' : 'Retiré'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <form action={basculerModeleAction.bind(null, m.code, !m.actif)}>
                    <Button type="submit" variant="outline" size="sm">
                      {m.actif ? 'Retirer' : 'Rétablir'}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
