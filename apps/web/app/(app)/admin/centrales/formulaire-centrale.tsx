'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, CaseACocher, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { CentraleResume } from '@/server/services/fournisseurs';

export function FormulaireCentrale({
  action,
  centrale,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  centrale?: CentraleResume;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={centrale?.nom} requis />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="email"
          libelle="E-mail"
          type="email"
          defaut={centrale?.email}
        />
        <ChampTexte
          etat={etat}
          nom="telephone"
          libelle="Téléphone"
          type="tel"
          defaut={centrale?.telephone}
        />
      </div>
      <ChampTexte etat={etat} nom="adresse" libelle="Adresse" defaut={centrale?.adresse} />
      <CaseACocher etat={etat} nom="actif" libelle="Active" defaut={centrale?.actif ?? true} />
      <div>
        <BoutonEnvoi>{centrale ? 'Enregistrer' : 'Créer la centrale'}</BoutonEnvoi>
      </div>
    </form>
  );
}
