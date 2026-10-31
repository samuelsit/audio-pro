import { LIBELLES_STATUTS_ORGANISATION } from '@ha/domain';
import type { Metadata } from 'next';

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
import { requireSuperadmin } from '@/server/auth/gardes';
import { listerOrganisations } from '@/server/services/organisations';

import { reactiverOrganisationAction, suspendreOrganisationAction } from './actions';

export const metadata: Metadata = { title: 'Clients – HA-Gestion' };

export default async function PageConsole() {
  const acteur = await requireSuperadmin();
  const organisations = await listerOrganisations(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Clients"
        action={{ href: '/console/organisations/nouvelle', libelle: 'Nouveau client' }}
      >
        Réseaux et centres indépendants. La console ne donne accès à aucune donnée patient.
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Raison sociale</TableHead>
            <TableHead>SIREN</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Centres</TableHead>
            <TableHead>Utilisateurs</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organisations.map((o) => {
            const suspendu = o.statut === 'SUSPENDU';
            return (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.raisonSociale}</TableCell>
                <TableCell>{o.siren ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={suspendu ? 'destructive' : 'secondary'}>
                    {LIBELLES_STATUTS_ORGANISATION[o.statut]}
                  </Badge>
                </TableCell>
                <TableCell>{o.centres}</TableCell>
                <TableCell>{o.utilisateurs}</TableCell>
                <TableCell>
                  {suspendu ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={reactiverOrganisationAction.bind(null, o.id, 'ACTIF')}>
                        <Button type="submit" variant="outline" size="sm">
                          Réactiver
                        </Button>
                      </form>
                      <form action={reactiverOrganisationAction.bind(null, o.id, 'ESSAI')}>
                        <Button type="submit" variant="outline" size="sm">
                          Réactiver en essai
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <form action={suspendreOrganisationAction.bind(null, o.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Suspendre
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
