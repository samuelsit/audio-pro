import { LIBELLES_EVENEMENTS_CAISSE } from '@ha/domain';
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
import { formaterDateHeure } from '@/lib/format';
import { ouIntrouvable } from '@/server/auth/gardes';
import { JOURNAL_PAR_PAGE, listerJournalCaisse } from '@/server/services/caisse';

import { centreDeCaisse, ChoisirUnCentre } from '../centre';

export const metadata: Metadata = { title: 'Journal de caisse – HA-Gestion' };

const LONGUEUR_EMPREINTE = 12;

export default async function PageJournalCaisse() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  const evenements = await ouIntrouvable(listerJournalCaisse(acteur, centreId));
  return (
    <div className="grid gap-6">
      <EntetePage titre="Journal des événements de caisse">
        Les {JOURNAL_PAR_PAGE} derniers événements, en ajout seul. La suite figure dans les
        archives.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">Rang</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Événement</TableHead>
            <TableHead>Acteur</TableHead>
            <TableHead>Empreinte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {evenements.map((e) => (
            <TableRow key={e.rang}>
              <TableCell className="text-right">{e.rang}</TableCell>
              <TableCell>{formaterDateHeure(e.createdAt)}</TableCell>
              <TableCell>{LIBELLES_EVENEMENTS_CAISSE[e.type]}</TableCell>
              <TableCell>{e.acteur ? `${e.acteur.prenom} ${e.acteur.nom}` : 'Système'}</TableCell>
              <TableCell className="font-mono">
                {e.empreinte.slice(0, LONGUEUR_EMPREINTE)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
