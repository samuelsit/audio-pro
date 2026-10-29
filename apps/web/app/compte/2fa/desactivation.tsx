'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { desactiverDeuxFacteurs } from '../actions';

export function DesactivationDeuxFacteurs() {
  const [etat, action] = useActionState(desactiverDeuxFacteurs, ETAT_INITIAL);
  return (
    <form action={action} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="motDePasse"
        libelle="Mot de passe"
        type="password"
        autoComplete="current-password"
        requis
      />
      <BoutonEnvoi variant="outline">Désactiver la vérification en deux étapes</BoutonEnvoi>
    </form>
  );
}
