'use client';

import { JOURS_SEMAINE, LIBELLES_JOURS, PLAGES_PAR_JOUR, type HorairesOuverture } from '@ha/domain';

import { ChampTexte } from '@/components/formulaire';
import type { EtatFormulaire } from '@/lib/formulaire';

/** Grille des horaires d'une semaine ; la lire avec `horaires(formData)`. */
export function ChampsHoraires({
  etat,
  legende,
  erreur,
  horaires,
}: {
  etat: EtatFormulaire;
  legende: string;
  /** Clé des erreurs de ce champ dans `etat`. */
  erreur: string;
  horaires?: HorairesOuverture | undefined;
}) {
  const messages = etat.erreurs?.[erreur];
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">{legende}</legend>
      {messages?.length ? <p className="text-sm text-destructive">{messages.join(' ')}</p> : null}
      {JOURS_SEMAINE.map((jour) => (
        <div key={jour} className="grid items-end gap-2 sm:grid-cols-[6rem_1fr_1fr]">
          <p className="text-sm">{LIBELLES_JOURS[jour]}</p>
          {Array.from({ length: PLAGES_PAR_JOUR }, (_, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <ChampTexte
                etat={etat}
                nom={`${jour}-${i}-debut`}
                libelle="Début"
                type="time"
                mentionFacultatif={false}
                defaut={horaires?.[jour][i]?.debut}
              />
              <ChampTexte
                etat={etat}
                nom={`${jour}-${i}-fin`}
                libelle="Fin"
                type="time"
                mentionFacultatif={false}
                defaut={horaires?.[jour][i]?.fin}
              />
            </div>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
