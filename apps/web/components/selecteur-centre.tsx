'use client';

import { useTransition } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const VALEUR_TOUS = 'tous';

export function SelecteurCentre({
  centres,
  valeur,
  tousLesCentres,
  choisir,
}: {
  centres: readonly { id: string; nom: string }[];
  valeur: string;
  /** Option « Tous les centres » (ADMIN). */
  tousLesCentres: boolean;
  choisir: (choix: string) => Promise<void>;
}) {
  const [enCours, demarrer] = useTransition();
  return (
    <Select
      value={valeur}
      disabled={enCours}
      onValueChange={(choix) => demarrer(() => choisir(choix))}
    >
      <SelectTrigger aria-label="Centre courant" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tousLesCentres ? <SelectItem value={VALEUR_TOUS}>Tous les centres</SelectItem> : null}
        {centres.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.nom}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
