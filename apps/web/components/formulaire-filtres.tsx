import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Filtres d'une liste : formulaire GET, les valeurs vont dans l'URL (partageables, page 1 à chaque filtrage).
 * Les champs sont ceux de `components/formulaire` (ChampTexte, ListeDeroulante…).
 */
export function FormulaireFiltres({ chemin, children }: { chemin: string; children: ReactNode }) {
  return (
    <form
      method="get"
      action={chemin}
      role="search"
      className="grid items-end gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {children}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit">Filtrer</Button>
        <Button asChild variant="outline">
          <Link href={chemin}>Réinitialiser</Link>
        </Button>
      </div>
    </form>
  );
}
