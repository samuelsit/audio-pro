'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, MessageFormulaire } from '@/components/formulaire';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export interface OptionsSimulation {
  /** Valeur courante du sélecteur (carte insérée ou incident simulé). */
  courante: string;
  options: readonly { valeur: string; libelle: string }[];
  choisir: (formData: FormData) => Promise<void>;
}

/** Bouton « Lire la carte Vitale » ; en développement, sélecteur de la carte insérée dans le lecteur simulé. */
export function BoutonLectureVitale({
  action,
  simulation,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  simulation: OptionsSimulation | null;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <div className="grid justify-items-end gap-2">
      <div className="flex flex-wrap items-end justify-end gap-2">
        {simulation ? (
          <form action={simulation.choisir} className="grid gap-1">
            <Label htmlFor="simulation-vitale" className="text-xs text-muted-foreground">
              Carte insérée (simulation)
            </Label>
            <select
              key={simulation.courante}
              id="simulation-vitale"
              name="simulation"
              defaultValue={simulation.courante}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-9 rounded-md border border-dashed border-input bg-transparent px-2 text-sm"
            >
              {simulation.options.map((o) => (
                <option key={o.valeur} value={o.valeur}>
                  {o.libelle}
                </option>
              ))}
            </select>
          </form>
        ) : null}
        <form action={envoyer}>
          <BoutonEnvoi variant="outline" enCours="Lecture en cours…">
            Lire la carte Vitale
          </BoutonEnvoi>
        </form>
      </div>
      <MessageFormulaire etat={etat} />
    </div>
  );
}
