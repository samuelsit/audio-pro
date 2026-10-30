'use client';

import {
  CLASSES_LPP,
  LIBELLES_CLASSES_LPP,
  LIBELLES_TYPES_AIDE_AUDITIVE,
  TYPES_AIDE_AUDITIVE,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { FabricantResume, ModeleResume } from '@/server/services/catalogue';

export function FormulaireModele({
  action,
  fabricants,
  modele,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  fabricants: readonly FabricantResume[];
  modele?: ModeleResume;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="fabricantId"
        libelle="Fabricant"
        vide="Choisir un fabricant…"
        defaut={modele?.fabricantId}
        options={fabricants.map((f) => ({ valeur: f.id, libelle: f.nom }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="gamme" libelle="Gamme" defaut={modele?.gamme} requis />
        <ChampTexte etat={etat} nom="nom" libelle="Modèle" defaut={modele?.nom} requis />
        <ListeDeroulante
          etat={etat}
          nom="type"
          libelle="Type"
          vide="Choisir…"
          defaut={modele?.type}
          options={TYPES_AIDE_AUDITIVE.map((t) => ({
            valeur: t,
            libelle: LIBELLES_TYPES_AIDE_AUDITIVE[t],
          }))}
        />
        <ListeDeroulante
          etat={etat}
          nom="classe"
          libelle="Classe"
          vide="Choisir…"
          defaut={modele?.classe}
          options={CLASSES_LPP.map((c) => ({ valeur: c, libelle: LIBELLES_CLASSES_LPP[c] }))}
        />
      </div>
      <ZoneDeTexte
        etat={etat}
        nom="codesLpp"
        libelle="Codes LPP associés"
        defaut={modele?.codesLpp.join(' ')}
        lignes={2}
        aide="Codes génériques ou spécifiques, séparés par des espaces."
      />
      <ChampTexte
        etat={etat}
        nom="prixConseilleCentimes"
        libelle="Prix de vente conseillé (€)"
        defaut={modele ? (modele.prixConseilleCentimes / 100).toFixed(2).replace('.', ',') : ''}
        requis
      />
      <CaseACocher etat={etat} nom="actif" libelle="Actif" defaut={modele?.actif ?? true} />
      <div>
        <BoutonEnvoi>{modele ? 'Enregistrer' : 'Créer le modèle'}</BoutonEnvoi>
      </div>
    </form>
  );
}
