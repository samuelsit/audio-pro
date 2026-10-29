'use client';

import { useActionState } from 'react';

import { BoutonConfirmation } from '@/components/confirmation';
import { MessageFormulaire } from '@/components/formulaire';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export interface LigneFusion {
  champ: string;
  libelle: string;
  conservee: string;
  doublon: string;
  parDefaut: 'conservee' | 'doublon';
}

function Choix({ ligne, source }: { ligne: LigneFusion; source: 'conservee' | 'doublon' }) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="radio"
        name={`choix.${ligne.champ}`}
        value={source}
        defaultChecked={ligne.parDefaut === source}
        className="mt-1 size-4 accent-primary"
      />
      <span className="break-words whitespace-normal">{ligne[source]}</span>
    </label>
  );
}

/** Un bouton radio par champ différent ; les notes des deux fiches sont toujours conservées. */
export function FormulaireFusion({
  action,
  lignes,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  lignes: readonly LigneFusion[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Les deux fiches ont les mêmes valeurs : la fusion ne retire que la fiche en double.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Champ</TableHead>
              <TableHead>Fiche conservée</TableHead>
              <TableHead>Fiche en double</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne) => (
              <TableRow key={ligne.champ}>
                <TableCell className="font-medium">{ligne.libelle}</TableCell>
                <TableCell>
                  <Choix ligne={ligne} source="conservee" />
                </TableCell>
                <TableCell>
                  <Choix ligne={ligne} source="doublon" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div>
        <BoutonConfirmation
          libelle="Fusionner les fiches"
          titre="Fusionner ces deux fiches ?"
          description="La fiche conservée reçoit les valeurs choisies et les notes des deux fiches. La fiche en double disparaît des listes (elle reste dans le journal d’audit). Cette opération ne s’annule pas depuis l’écran."
          confirmer="Fusionner"
        />
      </div>
    </form>
  );
}
