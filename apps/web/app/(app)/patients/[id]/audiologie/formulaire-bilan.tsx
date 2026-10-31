'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireBilan({
  action,
  jour,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  jour: string;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      <div className="flex items-end gap-3">
        <ChampTexte
          etat={etat}
          nom="dateBilan"
          libelle="Date du bilan"
          type="date"
          defaut={jour}
          requis
        />
        <BoutonEnvoi enCours="Création…">Nouveau bilan</BoutonEnvoi>
      </div>
    </form>
  );
}
