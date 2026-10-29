'use client';

import { LONGUEUR_MIN_MOT_DE_PASSE } from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { changerMotDePasse } from '../actions';

export function FormulaireMotDePasse() {
  const [etat, action] = useActionState(changerMotDePasse, ETAT_INITIAL);
  return (
    <form action={action} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="motDePasseActuel"
        libelle="Mot de passe actuel"
        type="password"
        autoComplete="current-password"
        requis
      />
      <ChampTexte
        etat={etat}
        nom="nouveauMotDePasse"
        libelle="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères. Une phrase de plusieurs mots est idéale.`}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="confirmation"
        libelle="Confirmation du nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        requis
      />
      <BoutonEnvoi>Changer le mot de passe</BoutonEnvoi>
    </form>
  );
}
