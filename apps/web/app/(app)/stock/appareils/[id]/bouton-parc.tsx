'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { basculerParcAction } from '../../actions';

export function BoutonParc({ appareilId, parcPret }: { appareilId: string; parcPret: boolean }) {
  const [etat, envoyer] = useActionState(
    basculerParcAction.bind(null, appareilId, !parcPret),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi variant="outline">
          {parcPret ? 'Retirer du parc de prêt' : 'Affecter au parc de prêt'}
        </BoutonEnvoi>
      </div>
    </form>
  );
}
