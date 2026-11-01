'use client';

import { LIBELLES_NATURES_LIGNE_FACTURE, NATURES_LIGNE_FACTURE } from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { ajouterTauxTvaAction } from '../actions';

const OPTIONS = NATURES_LIGNE_FACTURE.map((valeur) => ({
  valeur,
  libelle: LIBELLES_NATURES_LIGNE_FACTURE[valeur],
}));

export function FormulaireTauxTva() {
  const [etat, envoyer] = useActionState(ajouterTauxTvaAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <h2 className="text-lg font-medium">Ajouter un taux</h2>
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="type"
        libelle="Type de produit"
        vide="Choisir…"
        options={OPTIONS}
      />
      <ChampTexte etat={etat} nom="taux" libelle="Taux en %" requis />
      <ChampTexte etat={etat} nom="debut" libelle="Applicable à partir du" type="date" requis />
      <div>
        <BoutonEnvoi>Ajouter</BoutonEnvoi>
      </div>
    </form>
  );
}
