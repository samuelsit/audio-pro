'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { seConnecter } from './actions';

export function FormulaireConnexion() {
  const [etat, action] = useActionState(seConnecter, ETAT_INITIAL);
  return (
    <form action={action} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="email"
        libelle="Adresse e-mail"
        type="email"
        autoComplete="username"
        requis
      />
      <ChampTexte
        etat={etat}
        nom="motDePasse"
        libelle="Mot de passe"
        type="password"
        autoComplete="current-password"
        requis
      />
      <BoutonEnvoi>Se connecter</BoutonEnvoi>
    </form>
  );
}
