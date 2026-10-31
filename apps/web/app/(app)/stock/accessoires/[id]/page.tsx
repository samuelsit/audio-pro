import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDateHeure } from '@/lib/format';
import { ouIntrouvable, perimetreCourant } from '@/server/auth/gardes';
import { obtenirAccessoire } from '@/server/services/catalogue';
import { historiqueAccessoire, type MouvementAccessoireAffiche } from '@/server/services/stock';

export const metadata: Metadata = { title: 'Historique d’un accessoire – HA-Gestion' };

const LIBELLES_TYPE: Readonly<Record<MouvementAccessoireAffiche['type'], string>> = {
  ENTREE: 'Entrée',
  SORTIE: 'Sortie',
  TRANSFERT_SORTANT: 'Transfert sortant',
  TRANSFERT_ENTRANT: 'Transfert entrant',
  INVENTAIRE_ENTREE: 'Inventaire, écart positif',
  INVENTAIRE_SORTIE: 'Inventaire, écart négatif',
};

export default async function PageHistoriqueAccessoire({
  params,
}: PageProps<'/stock/accessoires/[id]'>) {
  const { id } = await params;
  const { acteur, perimetre } = await perimetreCourant();
  const accessoire = await ouIntrouvable(obtenirAccessoire(acteur, id));
  const mouvements = await historiqueAccessoire(acteur, perimetre, id);
  return (
    <div className="grid gap-6">
      <EntetePage titre={accessoire.nom}>Derniers mouvements du périmètre courant.</EntetePage>
      {mouvements.length === 0 ? (
        <EtatVide titre="Aucun mouvement">Rien n’a été enregistré dans ce périmètre.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date et heure</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead>Mouvement</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead className="text-right">Stock après</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Motif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mouvements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap">
                  {formaterDateHeure(m.horodatage)}
                </TableCell>
                <TableCell>{m.centre}</TableCell>
                <TableCell>{LIBELLES_TYPE[m.type]}</TableCell>
                <TableCell className="text-right">{m.quantite}</TableCell>
                <TableCell className="text-right">{m.quantiteApres}</TableCell>
                <TableCell>{m.utilisateur}</TableCell>
                <TableCell className="max-w-xs break-words whitespace-normal">{m.motif}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div>
        <Button asChild variant="outline">
          <Link href="/stock/accessoires">Retour aux accessoires</Link>
        </Button>
      </div>
    </div>
  );
}
