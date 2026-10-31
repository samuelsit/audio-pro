'use client';

import { JOURS_SEMAINE, LIBELLES_JOURS, PLAGES_PAR_JOUR } from '@ha/domain';
import { useActionState } from 'react';

import { BoutonEnvoi, CaseACocher, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { CentreDetail } from '@/server/services/centres';

export function FormulaireCentre({
  action,
  centre,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  centre?: CentreDetail;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom du centre" defaut={centre?.nom} requis />
      <ChampTexte
        etat={etat}
        nom="adresseLigne1"
        libelle="Adresse"
        defaut={centre?.adresseLigne1}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="adresseLigne2"
        libelle="Complément d’adresse"
        defaut={centre?.adresseLigne2}
      />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <ChampTexte
          etat={etat}
          nom="codePostal"
          libelle="Code postal"
          defaut={centre?.codePostal}
          inputMode="numeric"
          requis
        />
        <ChampTexte etat={etat} nom="ville" libelle="Ville" defaut={centre?.ville} requis />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="email"
          libelle="E-mail"
          type="email"
          defaut={centre?.email}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="telephone"
          libelle="Téléphone"
          type="tel"
          defaut={centre?.telephone}
          requis
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="finess" libelle="N° FINESS" defaut={centre?.finess} />
        <ChampTexte
          etat={etat}
          nom="numeroFacturationAm"
          libelle="N° de facturation Assurance Maladie"
          defaut={centre?.numeroFacturationAm}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="raisonSociale"
          libelle="Raison sociale"
          defaut={centre?.raisonSociale}
        />
        <ChampTexte etat={etat} nom="siret" libelle="N° SIRET" defaut={centre?.siret} requis />
        <ChampTexte etat={etat} nom="rcs" libelle="N° RCS" defaut={centre?.rcs} />
        <ChampTexte
          etat={etat}
          nom="tvaIntracommunautaire"
          libelle="N° TVA intracommunautaire"
          defaut={centre?.tvaIntracommunautaire}
        />
      </div>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Horaires d’ouverture</legend>
        {etat.erreurs?.horairesOuverture?.length ? (
          <p className="text-sm text-destructive">{etat.erreurs.horairesOuverture.join(' ')}</p>
        ) : null}
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
                  defaut={centre?.horairesOuverture[jour][i]?.debut}
                />
                <ChampTexte
                  etat={etat}
                  nom={`${jour}-${i}-fin`}
                  libelle="Fin"
                  type="time"
                  mentionFacultatif={false}
                  defaut={centre?.horairesOuverture[jour][i]?.fin}
                />
              </div>
            ))}
          </div>
        ))}
      </fieldset>
      <CaseACocher etat={etat} nom="actif" libelle="Centre actif" defaut={centre?.actif ?? true} />
      <div>
        <BoutonEnvoi>{centre ? 'Enregistrer' : 'Créer le centre'}</BoutonEnvoi>
      </div>
    </form>
  );
}
