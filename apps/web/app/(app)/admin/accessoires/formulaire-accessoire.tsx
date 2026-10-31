'use client';

import { LIBELLES_NATURES_ACCESSOIRE, NATURES_ACCESSOIRE } from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { AccessoireResume } from '@/server/services/catalogue';

export function FormulaireAccessoire({
  action,
  accessoire,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  accessoire?: AccessoireResume;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={accessoire?.nom} requis />
      <ListeDeroulante
        etat={etat}
        nom="nature"
        libelle="Nature"
        vide="Choisir…"
        defaut={accessoire?.nature}
        options={NATURES_ACCESSOIRE.map((n) => ({
          valeur: n,
          libelle: LIBELLES_NATURES_ACCESSOIRE[n],
        }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="codeLpp"
          libelle="Code LPP"
          defaut={accessoire?.codeLpp}
          inputMode="numeric"
        />
        <ChampTexte
          etat={etat}
          nom="prixCentimes"
          libelle="Prix (€)"
          defaut={accessoire ? (accessoire.prixCentimes / 100).toFixed(2).replace('.', ',') : ''}
          requis
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="marque" libelle="Marque" defaut={accessoire?.marque} />
        <ChampTexte
          etat={etat}
          nom="referenceCommerciale"
          libelle="Référence commerciale"
          defaut={accessoire?.referenceCommerciale}
        />
      </div>
      <CaseACocher etat={etat} nom="actif" libelle="Actif" defaut={accessoire?.actif ?? true} />
      <div>
        <BoutonEnvoi>{accessoire ? 'Enregistrer' : 'Créer l’accessoire'}</BoutonEnvoi>
      </div>
    </form>
  );
}
