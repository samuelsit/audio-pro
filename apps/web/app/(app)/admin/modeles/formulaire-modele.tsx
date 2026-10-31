'use client';

import {
  CLASSES_LPP,
  LIBELLES_CLASSES_LPP,
  LIBELLES_LIEUX_FABRICATION,
  LIBELLES_OPTIONS_AIDE_AUDITIVE,
  LIBELLES_TYPES_AIDE_AUDITIVE,
  LIEUX_FABRICATION,
  OPTIONS_AIDE_AUDITIVE,
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

const OUI_NON = [
  { valeur: 'oui', libelle: 'Oui' },
  { valeur: 'non', libelle: 'Non' },
];

function ouiNon(valeur: boolean | null | undefined): string | undefined {
  if (valeur === null || valeur === undefined) {
    return undefined;
  }
  return valeur ? 'oui' : 'non';
}

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
      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Mentions du devis normalisé</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte etat={etat} nom="marque" libelle="Marque" defaut={modele?.marque} />
          <ChampTexte
            etat={etat}
            nom="referenceCommerciale"
            libelle="Référence commerciale"
            defaut={modele?.referenceCommerciale}
          />
          <ListeDeroulante
            etat={etat}
            nom="lieuFabrication"
            libelle="Lieu de fabrication"
            vide="Non renseigné"
            requis={false}
            defaut={modele?.lieuFabrication ?? undefined}
            options={LIEUX_FABRICATION.map((l) => ({
              valeur: l,
              libelle: LIBELLES_LIEUX_FABRICATION[l],
            }))}
          />
          <ChampTexte
            etat={etat}
            nom="nombreCanaux"
            libelle="Nombre de canaux"
            defaut={modele?.nombreCanaux?.toString()}
            inputMode="numeric"
          />
        </div>
        <ChampTexte
          etat={etat}
          nom="connectivite"
          libelle="Dispositifs de connectivité"
          defaut={modele?.connectivite}
          aide="Liste exhaustive (télécommande, Bluetooth…), ou « Aucun »."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <ListeDeroulante
            etat={etat}
            nom="antiLarsen"
            libelle="Anti-larsen"
            vide="Non renseigné"
            requis={false}
            defaut={ouiNon(modele?.antiLarsen)}
            options={OUI_NON}
          />
          <ListeDeroulante
            etat={etat}
            nom="reducteurAcouphenes"
            libelle="Réducteur d’acouphènes"
            vide="Non renseigné"
            requis={false}
            defaut={ouiNon(modele?.reducteurAcouphenes)}
            options={OUI_NON}
          />
          <ListeDeroulante
            etat={etat}
            nom="bobineT"
            libelle="Bobine T"
            vide="Non renseigné"
            requis={false}
            defaut={ouiNon(modele?.bobineT)}
            options={OUI_NON}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS_AIDE_AUDITIVE.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="options"
                value={option}
                defaultChecked={modele?.options.includes(option) ?? false}
              />
              {LIBELLES_OPTIONS_AIDE_AUDITIVE[option]}
            </label>
          ))}
        </div>
      </fieldset>
      <CaseACocher etat={etat} nom="actif" libelle="Actif" defaut={modele?.actif ?? true} />
      <div>
        <BoutonEnvoi>{modele ? 'Enregistrer' : 'Créer le modèle'}</BoutonEnvoi>
      </div>
    </form>
  );
}
