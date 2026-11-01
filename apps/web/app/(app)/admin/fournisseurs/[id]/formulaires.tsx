'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

export function FormulaireContact({ action }: { action: Action }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="nom" libelle="Nom" requis />
        <ChampTexte etat={etat} nom="fonction" libelle="Fonction" />
        <ChampTexte etat={etat} nom="email" libelle="E-mail" type="email" />
        <ChampTexte etat={etat} nom="telephone" libelle="Téléphone" type="tel" />
      </div>
      <div>
        <BoutonEnvoi>Ajouter le contact</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireComptes({
  action,
  centres,
  comptes,
}: {
  action: Action;
  centres: readonly { id: string; nom: string }[];
  comptes: readonly { centreId: string; numeroClient: string }[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        {centres.map((c) => (
          <ChampTexte
            key={c.id}
            etat={etat}
            nom={`compte-${c.id}`}
            libelle={c.nom}
            defaut={comptes.find((compte) => compte.centreId === c.id)?.numeroClient}
          />
        ))}
      </div>
      <div>
        <BoutonEnvoi>Enregistrer les numéros</BoutonEnvoi>
      </div>
    </form>
  );
}
