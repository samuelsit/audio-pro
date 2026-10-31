'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ListeDeroulante, MessageFormulaire } from '@/components/formulaire';
import { formaterDate } from '@/lib/format';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireBilanReference({
  action,
  bilans,
  bilanId,
  statutAttendu,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  bilans: readonly { id: string; dateBilan: string }[];
  bilanId: string | null;
  statutAttendu: string;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-2">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statutAttendu} />
      <ListeDeroulante
        etat={etat}
        nom="bilanId"
        libelle="Bilan de référence"
        vide="Aucun"
        requis={false}
        defaut={bilanId ?? ''}
        options={bilans.map((b) => ({
          valeur: b.id,
          libelle: `Bilan du ${formaterDate(b.dateBilan)}`,
        }))}
      />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer le bilan</BoutonEnvoi>
      </div>
    </form>
  );
}
