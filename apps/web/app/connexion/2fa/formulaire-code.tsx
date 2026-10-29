'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { verifierCodeConnexion } from '../actions';

export function FormulaireCode() {
  const [etat, action] = useActionState(verifierCodeConnexion, ETAT_INITIAL);
  return (
    <form action={action} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="code"
        libelle="Code de vérification"
        autoComplete="one-time-code"
        inputMode="numeric"
        aide="Code à 6 chiffres de votre application d’authentification, ou l’un de vos codes de secours."
        requis
      />
      <BoutonEnvoi>Vérifier</BoutonEnvoi>
    </form>
  );
}
