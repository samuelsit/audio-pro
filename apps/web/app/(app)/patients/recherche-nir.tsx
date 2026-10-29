'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { rechercherNirAction } from './actions';

/** Recherche par NIR exact : formulaire POST, le NIR ne passe jamais dans l'URL. */
export function RechercheNir() {
  const [etat, envoyer] = useActionState(rechercherNirAction, ETAT_INITIAL);
  return (
    <form
      action={envoyer}
      className="grid items-end gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto]"
      role="search"
      aria-label="Recherche par NIR"
    >
      <div className="grid gap-2">
        <MessageFormulaire etat={etat} />
        <ChampTexte
          etat={etat}
          nom="nir"
          libelle="NIR exact (15 caractères, clé comprise)"
          autoComplete="off"
          mentionFacultatif={false}
          requis
        />
      </div>
      <BoutonEnvoi variant="outline">Rechercher par NIR</BoutonEnvoi>
    </form>
  );
}
