'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { modifierPrefixeAction } from './actions';

export function FormulairePrefixe({ centreId, prefixe }: { centreId: string; prefixe: string }) {
  const [etat, envoyer] = useActionState(modifierPrefixeAction.bind(null, centreId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <h2 className="text-lg font-medium">Série de factures</h2>
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="prefixe"
        libelle="Préfixe des numéros"
        defaut={prefixe}
        aide="Vaut pour les prochains numéros. Les pièces émises gardent le leur, et la suite continue."
        requis
      />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer le préfixe</BoutonEnvoi>
      </div>
    </form>
  );
}
