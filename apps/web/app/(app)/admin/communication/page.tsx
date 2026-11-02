import {
  LIBELLES_CANAUX_MESSAGE,
  LIBELLES_FINALITES_MESSAGE,
  LIBELLES_SCENARIOS,
} from '@ha/domain';
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
import {
  lireParametresDuClient,
  listerModelesCampagne,
  listerScenarios,
} from '@/server/services/communication';

import { basculerScenarioAction, enregistrerParametresAction } from './actions';
import { FormulaireParametres } from './formulaires';

export const metadata: Metadata = { title: 'Communication – HA-Gestion' };

export default async function PageCommunication() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const [parametres, scenarios, modeles] = await Promise.all([
    lireParametresDuClient(acteur),
    listerScenarios(acteur),
    listerModelesCampagne(acteur),
  ]);
  return (
    <div className="grid gap-8">
      <EntetePage titre="Communication">
        Les scénarios sont inactifs tant que vous ne les activez pas.
      </EntetePage>
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Scénarios</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scénario</TableHead>
              <TableHead>Finalité</TableHead>
              <TableHead>Canaux</TableHead>
              <TableHead>État</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarios.map((s) => (
              <TableRow key={s.scenario}>
                <TableCell>
                  <Link
                    href={`/admin/communication/modele?scenario=${s.scenario}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {LIBELLES_SCENARIOS[s.scenario]}
                  </Link>
                </TableCell>
                <TableCell>{LIBELLES_FINALITES_MESSAGE[s.finalite]}</TableCell>
                <TableCell>{s.canaux.map((c) => LIBELLES_CANAUX_MESSAGE[c]).join(', ')}</TableCell>
                <TableCell>
                  <Badge variant={s.actif ? 'default' : 'secondary'}>
                    {s.actif ? 'Actif' : 'Inactif'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <form action={basculerScenarioAction.bind(null, s.scenario)}>
                    <Button type="submit" variant="outline" size="sm">
                      {s.actif ? 'Désactiver' : 'Activer'}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Modèles de campagne</h2>
        {modeles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun modèle pour l’instant.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {modeles.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/communication/modele?id=${m.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {m.nom}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="outline" asChild>
            <Link href="/admin/communication/modele">Nouveau modèle</Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-base font-medium">Plages d’envoi et délais</h2>
        <FormulaireParametres action={enregistrerParametresAction} parametres={parametres} />
      </section>
    </div>
  );
}
