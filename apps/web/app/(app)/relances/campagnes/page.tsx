import { LIBELLES_CANAUX_MESSAGE, LIBELLES_STATUTS_CAMPAGNE, localDepuisInstant } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
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
import { formaterDate } from '@/lib/format';
import { requireRole } from '@/server/auth/gardes';
import { listerCampagnes } from '@/server/services/campagnes';

import { annulerCampagneAction } from '../actions';

export const metadata: Metadata = { title: 'Campagnes – HA-Gestion' };

export default async function PageCampagnes() {
  const acteur = await requireRole('ADMIN_CLIENT', 'RESPONSABLE_CENTRE');
  const campagnes = await listerCampagnes(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Campagnes">
        Seuls les patients consentants reçoivent une campagne.
      </EntetePage>
      <div>
        <Button asChild>
          <Link href="/relances/campagnes/nouvelle">Nouvelle campagne</Link>
        </Button>
      </div>
      {campagnes.length === 0 ? (
        <EtatVide titre="Aucune campagne">Les campagnes programmées apparaîtront ici.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Programmée le</TableHead>
              <TableHead>Destinataires</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {campagnes.map((c) => {
              const { date, heure } = localDepuisInstant(Date.parse(c.programmeeLe));
              return (
                <TableRow key={c.id}>
                  <TableCell>{c.nom}</TableCell>
                  <TableCell>{LIBELLES_CANAUX_MESSAGE[c.canal]}</TableCell>
                  <TableCell>
                    {formaterDate(date)} à {heure}
                  </TableCell>
                  <TableCell>{c.destinataires ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{LIBELLES_STATUTS_CAMPAGNE[c.statut]}</Badge>
                  </TableCell>
                  <TableCell>
                    {c.statut === 'PROGRAMMEE' ? (
                      <form action={annulerCampagneAction.bind(null, c.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          Annuler
                        </Button>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
