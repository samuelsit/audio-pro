'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, CaseACocher, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { FabricantResume } from '@/server/services/catalogue';

export function FormulaireFabricant({
  action,
  fabricant,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  fabricant?: FabricantResume;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={fabricant?.nom} requis />
      <ChampTexte
        etat={etat}
        nom="adresse"
        libelle="Adresse"
        defaut={fabricant?.adresse}
        aide="Exigée sur le devis normalisé."
      />
      <ChampTexte
        etat={etat}
        nom="mandataire"
        libelle="Mandataire"
        defaut={fabricant?.mandataire}
        aide="Nom et adresse, si le fabricant est hors UE."
      />
      <CaseACocher etat={etat} nom="actif" libelle="Actif" defaut={fabricant?.actif ?? true} />
      <div>
        <BoutonEnvoi>{fabricant ? 'Enregistrer' : 'Créer le fabricant'}</BoutonEnvoi>
      </div>
    </form>
  );
}
