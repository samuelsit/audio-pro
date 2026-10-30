'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { PrescripteurResume } from '@/server/services/prescripteurs';

import { ChampsPrescripteur } from './champs-prescripteur';

export function FormulairePrescripteur({
  action,
  prescripteur,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  prescripteur?: PrescripteurResume;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampsPrescripteur etat={etat} {...(prescripteur ? { prescripteur } : {})} />
      <div>
        <BoutonEnvoi>{prescripteur ? 'Enregistrer' : 'Créer la fiche'}</BoutonEnvoi>
      </div>
    </form>
  );
}
