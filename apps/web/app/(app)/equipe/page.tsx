import { LIBELLES_ROLES } from '@ha/domain';
import type { Metadata } from 'next';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerPraticiens } from '@/server/services/praticiens';
import { listerUtilisateurs } from '@/server/services/utilisateurs';

export const metadata: Metadata = { title: 'Équipe – HA-Gestion' };

export default async function PageEquipe() {
  const { acteur, perimetre } = await perimetreCourant();
  const [utilisateurs, praticiens] = await Promise.all([
    listerUtilisateurs(acteur, perimetre),
    listerPraticiens(acteur, perimetre),
  ]);

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>

      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Audioprothésistes</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>RPPS</TableHead>
              <TableHead>Centres d’exercice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {praticiens.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.prenom} {p.nom}
                </TableCell>
                <TableCell className="font-mono">{p.rpps}</TableCell>
                <TableCell>{p.centres.map((c) => c.nom).join(', ')}</TableCell>
              </TableRow>
            ))}
            {praticiens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Aucun audioprothésiste dans ce périmètre.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Membres</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Centres</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {utilisateurs.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  {u.prenom} {u.nom}
                </TableCell>
                <TableCell>{LIBELLES_ROLES[u.role]}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.centres.map((c) => c.nom).join(', ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
