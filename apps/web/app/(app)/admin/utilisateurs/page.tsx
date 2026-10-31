import { LIBELLES_ROLES } from '@ha/domain';
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
import { listerUtilisateurs } from '@/server/services/utilisateurs';

export const metadata: Metadata = { title: 'Utilisateurs – HA-Gestion' };

export default async function PageUtilisateurs() {
  const { acteur, perimetre } = await perimetreCourant();
  const utilisateurs = await listerUtilisateurs(acteur, perimetre);
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Utilisateurs"
        action={{ href: '/admin/utilisateurs/nouveau', libelle: 'Nouvel utilisateur' }}
      >
        {perimetre.type === 'tous'
          ? 'Tous les comptes de votre organisation.'
          : 'Comptes rattachés au centre courant (les administrateurs apparaissent avec « Tous mes centres »).'}
      </EntetePage>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead>Centres</TableHead>
            <TableHead>2FA</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {utilisateurs.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link
                  href={`/admin/utilisateurs/${u.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {u.prenom} {u.nom}
                </Link>
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{LIBELLES_ROLES[u.role]}</TableCell>
              <TableCell>
                {u.role === 'ADMIN_CLIENT' ? 'Tous' : u.centres.map((c) => c.nom).join(', ')}
              </TableCell>
              <TableCell>{u.deuxFacteursActif ? 'Activée' : '—'}</TableCell>
              <TableCell>
                {u.actif ? <Badge>Actif</Badge> : <Badge variant="secondary">Désactivé</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
