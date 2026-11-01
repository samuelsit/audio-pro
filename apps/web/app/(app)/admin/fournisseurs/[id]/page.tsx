import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ouIntrouvable, perimetreCourant, requireRole } from '@/server/auth/gardes';
import { listerFabricants } from '@/server/services/catalogue';
import { listerCentrales, obtenirFournisseur } from '@/server/services/fournisseurs';

import {
  ajouterContactAction,
  enregistrerComptesAction,
  modifierFournisseurAction,
  retirerContactAction,
} from '../actions';
import { FormulaireFournisseur } from '../formulaire-fournisseur';
import { FormulaireComptes, FormulaireContact } from './formulaires';

export const metadata: Metadata = { title: 'Fournisseur – HA-Gestion' };

export default async function PageFournisseur({ params }: PageProps<'/admin/fournisseurs/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const { centres } = await perimetreCourant();
  const [fournisseur, fabricants, centrales] = await Promise.all([
    ouIntrouvable(obtenirFournisseur(acteur, id)),
    listerFabricants(acteur),
    listerCentrales(acteur),
  ]);
  return (
    <div className="grid gap-8">
      <EntetePage titre={fournisseur.nom} />
      <FormulaireFournisseur
        action={modifierFournisseurAction.bind(null, id)}
        fournisseur={fournisseur}
        fabricants={fabricants}
        centrales={centrales}
      />
      <section className="grid gap-3">
        <h2 className="font-medium">Contacts</h2>
        {fournisseur.contacts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Fonction</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fournisseur.contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.nom}</TableCell>
                  <TableCell>{c.fonction ?? '—'}</TableCell>
                  <TableCell>{c.email ?? '—'}</TableCell>
                  <TableCell>{c.telephone ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <form action={retirerContactAction.bind(null, id, c.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Retirer
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <FormulaireContact action={ajouterContactAction.bind(null, id)} />
      </section>
      <section className="grid gap-3">
        <h2 className="font-medium">Numéros de client par centre</h2>
        <p className="text-sm text-muted-foreground">
          Ils servent à repérer le centre sur une facture reçue.
        </p>
        <FormulaireComptes
          action={enregistrerComptesAction.bind(null, id)}
          centres={centres}
          comptes={fournisseur.comptes}
        />
      </section>
    </div>
  );
}
