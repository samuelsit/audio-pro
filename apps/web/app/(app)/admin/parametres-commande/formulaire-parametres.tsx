'use client';

import type { ParametresCommande } from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireParametres({
  action,
  parametres,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  parametres: ParametresCommande;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="delaiRelanceJours"
          libelle="Délai avant relance (jours)"
          inputMode="numeric"
          defaut={String(parametres.delaiRelanceJours)}
          requis
          aide="Sans accusé de réception du fabricant."
        />
        <ChampTexte
          etat={etat}
          nom="relancesMax"
          libelle="Nombre maximal de relances"
          inputMode="numeric"
          defaut={String(parametres.relancesMax)}
          requis
        />
      </div>
      <ChampTexte
        etat={etat}
        nom="tolerancePrix"
        libelle="Tolérance de prix par article (€)"
        defaut={(parametres.tolerancePrixCentimes / 100).toFixed(2).replace('.', ',')}
        requis
        aide="En deçà, un écart de prix sur une facture n’est pas signalé."
      />
      <ChampTexte
        etat={etat}
        nom="adresseBoiteFactures"
        libelle="Adresse de réception des factures"
        type="email"
        defaut={parametres.adresseBoiteFactures}
        aide="Adresse unique du client : le centre se lit sur la facture."
      />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
