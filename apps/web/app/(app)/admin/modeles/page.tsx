import {
  centimes,
  ENTETES_CSV_MODELES,
  formatEuros,
  LIBELLES_CLASSES_LPP,
  LIBELLES_TYPES_AIDE_AUDITIVE,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ImportCsv } from '@/components/import-csv';
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
import { listerModeles } from '@/server/services/catalogue';

import { importerModelesAction } from './actions';

export const metadata: Metadata = { title: 'Modèles – HA-Gestion' };

export default async function PageModeles() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const modeles = await listerModeles(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Modèles d’aides auditives"
        action={{ href: '/admin/modeles/nouveau', libelle: 'Nouveau modèle' }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Modèle</TableHead>
            <TableHead>Fabricant</TableHead>
            <TableHead>Gamme</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Classe</TableHead>
            <TableHead>Codes LPP</TableHead>
            <TableHead className="text-right">Prix conseillé</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {modeles.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Link
                  href={`/admin/modeles/${m.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {m.nom}
                </Link>
              </TableCell>
              <TableCell>{m.fabricant}</TableCell>
              <TableCell>{m.gamme}</TableCell>
              <TableCell>{LIBELLES_TYPES_AIDE_AUDITIVE[m.type]}</TableCell>
              <TableCell>{LIBELLES_CLASSES_LPP[m.classe]}</TableCell>
              <TableCell className="font-mono">{m.codesLpp.length}</TableCell>
              <TableCell className="text-right">
                {formatEuros(centimes(m.prixConseilleCentimes))}
              </TableCell>
              <TableCell>
                {m.actif ? <Badge>Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ImportCsv
        action={importerModelesAction}
        colonnes={ENTETES_CSV_MODELES}
        id="fichier-modeles"
      />
    </div>
  );
}
