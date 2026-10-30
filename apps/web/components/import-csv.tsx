'use client';

import type { ErreurLigneCsv } from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, MessageFormulaire } from '@/components/formulaire';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EtatFormulaire } from '@/lib/formulaire';

/** État d'un import CSV : celui d'un formulaire, plus les erreurs ligne par ligne. */
export interface EtatImportCsv extends EtatFormulaire {
  erreursLignes?: readonly ErreurLigneCsv[];
}

const ETAT_INITIAL: EtatImportCsv = {};

/** Dépôt d'un fichier CSV, avec le rapport d'erreurs par ligne. */
export function ImportCsv({
  action,
  colonnes,
  id,
}: {
  action: (etat: EtatImportCsv, formData: FormData) => Promise<EtatImportCsv>;
  /** Colonnes attendues, affichées comme aide. */
  colonnes: readonly string[];
  id: string;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Importer un fichier CSV</h2>
      <MessageFormulaire etat={etat} />
      {etat.erreursLignes?.length ? (
        <ul className="grid gap-1 text-sm text-destructive">
          {etat.erreursLignes.map((e) => (
            <li key={`${e.ligne}-${e.message}`}>
              Ligne {e.ligne} : {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Fichier CSV (séparateur « ; », UTF-8)</Label>
        <Input id={id} name="fichier" type="file" accept=".csv,text/csv" required />
        <p className="text-sm text-muted-foreground">Colonnes : {colonnes.join(' ; ')}</p>
        <p className="text-sm text-muted-foreground">
          Tout ou rien : si une ligne est refusée, aucune n’est importée.
        </p>
      </div>
      <div>
        <BoutonEnvoi variant="outline" enCours="Import…">
          Importer
        </BoutonEnvoi>
      </div>
    </form>
  );
}
