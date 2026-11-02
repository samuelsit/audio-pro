'use client';

import {
  formationOtologieConcernee,
  LIBELLES_SPECIALITES_PRESCRIPTEUR,
  SPECIALITES_PRESCRIPTEUR,
  type SpecialitePrescripteur,
} from '@ha/domain';
import { useState } from 'react';

import { ChampTexte, ListeDeroulante } from '@/components/formulaire';
import type { EtatFormulaire } from '@/lib/formulaire';
import type { PrescripteurResume } from '@/server/services/prescripteurs';

function formationTexte(valeur: boolean | null | undefined): string {
  return valeur === null || valeur === undefined ? '' : valeur ? 'oui' : 'non';
}

function estSpecialite(valeur: string): valeur is SpecialitePrescripteur {
  return (SPECIALITES_PRESCRIPTEUR as readonly string[]).includes(valeur);
}

/** Champs d'une fiche, partagés par le formulaire complet et la création à la volée. */
export function ChampsPrescripteur({
  etat,
  prescripteur,
}: {
  etat: EtatFormulaire;
  prescripteur?: PrescripteurResume;
}) {
  const renvoyee = etat.valeurs?.['specialite'];
  const [specialite, setSpecialite] = useState(
    typeof renvoyee === 'string' ? renvoyee : (prescripteur?.specialite ?? ''),
  );
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={prescripteur?.nom} requis />
        <ChampTexte
          etat={etat}
          nom="prenom"
          libelle="Prénom"
          defaut={prescripteur?.prenom}
          requis
        />
        <div
          onChange={({ target }) => {
            if (target instanceof HTMLSelectElement) {
              setSpecialite(target.value);
            }
          }}
        >
          <ListeDeroulante
            etat={etat}
            nom="specialite"
            libelle="Spécialité"
            vide="Choisir…"
            defaut={prescripteur?.specialite}
            options={SPECIALITES_PRESCRIPTEUR.map((s) => ({
              valeur: s,
              libelle: LIBELLES_SPECIALITES_PRESCRIPTEUR[s],
            }))}
          />
        </div>
        {estSpecialite(specialite) && formationOtologieConcernee(specialite) ? (
          <ListeDeroulante
            etat={etat}
            nom="formationOtologie"
            libelle="Formation en otologie médicale"
            vide="Choisir…"
            defaut={formationTexte(prescripteur?.formationOtologie)}
            options={[
              { valeur: 'oui', libelle: 'Oui' },
              { valeur: 'non', libelle: 'Non' },
            ]}
          />
        ) : null}
        <ChampTexte
          etat={etat}
          nom="rpps"
          libelle="N° RPPS"
          defaut={prescripteur?.rpps}
          inputMode="numeric"
          aide="11 chiffres."
        />
        <ChampTexte etat={etat} nom="cabinet" libelle="Cabinet" defaut={prescripteur?.cabinet} />
      </div>
      <ChampTexte
        etat={etat}
        nom="contact"
        libelle="E-mail ou adresse MSSanté"
        type="email"
        defaut={prescripteur?.contact}
      />
      <ChampTexte
        etat={etat}
        nom="adresseLigne1"
        libelle="Adresse postale"
        defaut={prescripteur?.adresseLigne1}
      />
      <ChampTexte
        etat={etat}
        nom="adresseLigne2"
        libelle="Complément d’adresse"
        defaut={prescripteur?.adresseLigne2}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="codePostal"
          libelle="Code postal"
          defaut={prescripteur?.codePostal}
        />
        <ChampTexte etat={etat} nom="ville" libelle="Ville" defaut={prescripteur?.ville} />
      </div>
    </>
  );
}
