'use client';

import type { ParametresSav } from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireParametres({
  action,
  parametres,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  parametres: ParametresSav;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="dureeGarantieMois"
        libelle="Durée de la garantie (mois)"
        inputMode="numeric"
        defaut={String(parametres.dureeGarantieMois)}
        requis
        aide="48 mois au minimum (modèle de devis, p. 2 § 4). S’applique aux prochaines ventes."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="suiviMois"
          libelle="Contrôles après la délivrance (mois)"
          defaut={parametres.suiviMois.join(', ')}
          requis
          aide="Modèle de devis : 3, 6 et 12 mois."
        />
        <ChampTexte
          etat={etat}
          nom="suiviParAn"
          libelle="Contrôles par an ensuite"
          inputMode="numeric"
          defaut={String(parametres.suiviParAn)}
          requis
          aide="Deux recommandés (convention, art. 19)."
        />
      </div>
      <ChampTexte
        etat={etat}
        nom="pretDureeJours"
        libelle="Durée d’un prêt (jours)"
        inputMode="numeric"
        defaut={String(parametres.pretDureeJours)}
        requis
      />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
