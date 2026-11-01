import { LIBELLES_NATURES_LIGNE_FACTURE } from '@ha/domain';
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
import { listerTauxTva } from '@/server/services/taux-tva';

import { FormulaireTauxTva } from './formulaire-taux-tva';

export const metadata: Metadata = { title: 'Taux de TVA – HA-Gestion' };

export default async function PageTauxTva() {
  const acteur = await requireSuperadmin();
  const taux = await listerTauxTva(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Taux de TVA">
        Taux datés par type de produit, communs à tous les clients. Un changement ajoute une ligne :
        les factures validées gardent leur taux. Valeurs à faire valider par l’expert-comptable.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type de produit</TableHead>
            <TableHead>Taux</TableHead>
            <TableHead>À partir du</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {taux.map((t) => (
            <TableRow key={`${t.type}-${t.debut}`}>
              <TableCell>{LIBELLES_NATURES_LIGNE_FACTURE[t.type]}</TableCell>
              <TableCell>{(t.taux / 100).toLocaleString('fr-FR')} %</TableCell>
              <TableCell>{formaterDate(t.debut)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FormulaireTauxTva />
    </div>
  );
}
