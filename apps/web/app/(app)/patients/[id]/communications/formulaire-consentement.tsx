'use client';

import {
  CANAUX_MESSAGE,
  FINALITES_MESSAGE,
  LIBELLES_CANAUX_MESSAGE,
  LIBELLES_FINALITES_MESSAGE,
} from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, ListeDeroulante, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireConsentement({
  action,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="canal"
        libelle="Canal"
        requis
        options={CANAUX_MESSAGE.map((c) => ({ valeur: c, libelle: LIBELLES_CANAUX_MESSAGE[c] }))}
      />
      <fieldset className="flex flex-wrap gap-4">
        {FINALITES_MESSAGE.map((f) => (
          <label key={f} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="finalites" value={f} />
            {LIBELLES_FINALITES_MESSAGE[f]}
          </label>
        ))}
      </fieldset>
      <div>
        <BoutonEnvoi>Noter le consentement du patient</BoutonEnvoi>
      </div>
    </form>
  );
}
