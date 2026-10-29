'use client';

import { LONGUEUR_MIN_MOT_DE_PASSE } from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireReinitialisation({
  action,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="motDePasse"
        libelle="Nouveau mot de passe provisoire"
        type="password"
        autoComplete="new-password"
        aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères, à transmettre à l’utilisateur par un canal sûr.`}
        requis
      />
      <div>
        <BoutonEnvoi variant="outline">Réinitialiser le mot de passe</BoutonEnvoi>
      </div>
    </form>
  );
}
