import { centimes, formatEuros } from '@ha/domain';
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
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import {
  listerFabricants,
  obtenirModele,
  obtenirPrixAchatModele,
} from '@/server/services/catalogue';
import { decrireCodesLpp } from '@/server/services/lpp';

import { modifierModeleAction } from '../actions';
import { FormulaireModele } from '../formulaire-modele';

export const metadata: Metadata = { title: 'Modèle – HA-Gestion' };

const montant = (valeur: number | null | undefined) =>
  valeur === null || valeur === undefined ? '—' : formatEuros(centimes(valeur));

export default async function PageModele({ params }: PageProps<'/admin/modeles/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const [modele, fabricants, prixAchatCentimes] = await Promise.all([
    ouIntrouvable(obtenirModele(acteur, id)),
    listerFabricants(acteur),
    obtenirPrixAchatModele(acteur, id),
  ]);
  const codes = await decrireCodesLpp(modele.codesLpp);
  return (
    <div className="grid gap-6">
      <EntetePage titre={`${modele.fabricant} – ${modele.nom}`} />
      <FormulaireModele
        action={modifierModeleAction.bind(null, id)}
        fabricants={fabricants}
        modele={modele}
        prixAchatCentimes={prixAchatCentimes}
      />
      {codes.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-medium">Codes LPP associés, tarifs du jour</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Nature</TableHead>
                <TableHead className="text-right">Base de remboursement</TableHead>
                <TableHead className="text-right">Prix limite</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.libelle ?? 'Base LPP non importée'}</TableCell>
                  <TableCell className="font-mono">{c.tarif?.naturePrestation ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    {montant(c.tarif?.baseRemboursementCentimes)}
                  </TableCell>
                  <TableCell className="text-right">
                    {montant(c.tarif?.prixLimiteVenteCentimes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
