import type { Pagination as InfosPagination } from '@ha/domain';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { urlAvecParametres } from '@/lib/parametres';

// Composants serveur : la pagination se fait par l'URL (`?page=`), sans état côté client.

export interface Colonne<L> {
  readonly libelle: string;
  readonly rendu: (ligne: L) => ReactNode;
  readonly className?: string;
}

/** Liens « Précédente / Suivante », qui conservent les autres paramètres (filtres). */
export function Pagination({
  pagination,
  chemin,
  parametres,
}: {
  pagination: InfosPagination;
  chemin: string;
  parametres: Readonly<Record<string, string>>;
}) {
  const { page, nbPages, total, parPage } = pagination;
  const premiere = total === 0 ? 0 : (page - 1) * parPage + 1;
  const derniere = Math.min(page * parPage, total);
  const lien = (cible: number) => urlAvecParametres(chemin, parametres, { page: cible });
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'Aucun résultat' : `${premiere}–${derniere} sur ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Page {page} sur {nbPages}
        </span>
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={lien(page - 1)}>
              <ChevronLeft aria-hidden />
              Précédente
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden />
            Précédente
          </Button>
        )}
        {page < nbPages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={lien(page + 1)}>
              Suivante
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Suivante
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </nav>
  );
}

export function TableauPagine<L>({
  colonnes,
  lignes,
  cleLigne,
  pagination,
  chemin,
  parametres,
  vide = 'Aucun résultat.',
}: {
  colonnes: readonly Colonne<L>[];
  lignes: readonly L[];
  cleLigne: (ligne: L) => string;
  pagination: InfosPagination;
  chemin: string;
  parametres: Readonly<Record<string, string>>;
  vide?: string;
}) {
  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            {colonnes.map((c) => (
              <TableHead key={c.libelle} className={c.className}>
                {c.libelle}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lignes.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colonnes.length}
                className="py-8 text-center text-muted-foreground"
              >
                {vide}
              </TableCell>
            </TableRow>
          ) : (
            lignes.map((ligne) => (
              <TableRow key={cleLigne(ligne)}>
                {colonnes.map((c) => (
                  <TableCell key={c.libelle} className={c.className}>
                    {c.rendu(ligne)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination pagination={pagination} chemin={chemin} parametres={parametres} />
    </div>
  );
}
