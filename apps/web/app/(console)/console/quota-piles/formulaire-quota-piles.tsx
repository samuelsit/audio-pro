'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { ajouterQuotaPilesAction } from '../actions';

export function FormulaireQuotaPiles() {
  const [etat, envoyer] = useActionState(ajouterQuotaPilesAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <h2 className="text-lg font-medium">Ajouter un quota</h2>
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="boitesParAn"
        libelle="Boîtes par an"
        inputMode="numeric"
        requis
      />
      <ChampTexte etat={etat} nom="debut" libelle="Applicable à partir du" type="date" requis />
      <ChampTexte etat={etat} nom="source" libelle="Texte qui fixe ce quota" requis />
      <div>
        <BoutonEnvoi>Ajouter</BoutonEnvoi>
      </div>
    </form>
  );
}
