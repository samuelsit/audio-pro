'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, MessageFormulaire } from '@/components/formulaire';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export interface LigneComparaison {
  champ: string;
  libelle: string;
  base: string;
  carte: string;
}

function Choix({ ligne, source }: { ligne: LigneComparaison; source: 'base' | 'carte' }) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="radio"
        name={`choix.${ligne.champ}`}
        value={source}
        defaultChecked={source === 'carte'}
        aria-label={`${ligne.libelle} : ${source === 'carte' ? 'mettre à jour depuis la carte' : 'garder la base'}`}
        className="mt-1 size-4 accent-primary"
      />
      <span className="break-words whitespace-normal">{ligne[source]}</span>
    </label>
  );
}

/** Un choix par champ différent : garder la valeur de la base ou prendre celle de la carte. */
export function FormulaireComparaison({
  action,
  lignes,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  lignes: readonly LigneComparaison[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          La fiche est à jour : la carte ne contient aucune valeur différente. Enregistrer note la
          date de cette lecture.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Champ</TableHead>
              <TableHead>Garder la base</TableHead>
              <TableHead>Mettre à jour depuis la carte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne) => (
              <TableRow key={ligne.champ}>
                <TableCell className="font-medium">{ligne.libelle}</TableCell>
                <TableCell>
                  <Choix ligne={ligne} source="base" />
                </TableCell>
                <TableCell>
                  <Choix ligne={ligne} source="carte" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div>
        <BoutonEnvoi>Enregistrer les mises à jour</BoutonEnvoi>
      </div>
    </form>
  );
}
