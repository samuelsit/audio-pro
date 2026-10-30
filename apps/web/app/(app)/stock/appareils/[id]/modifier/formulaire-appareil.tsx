'use client';

import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { ModeleResume } from '@/server/services/catalogue';
import type { FicheAppareil } from '@/server/services/stock';

export function FormulaireAppareil({
  action,
  fiche,
  modeles,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  fiche: FicheAppareil;
  modeles: readonly ModeleResume[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const prix =
    fiche.prixAchatCentimes === null
      ? ''
      : (fiche.prixAchatCentimes / 100).toFixed(2).replace('.', ',');
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      {fiche.corrigeable ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="numeroSerie"
            libelle="Numéro de série"
            defaut={fiche.numeroSerie}
            requis
          />
          <ListeDeroulante
            etat={etat}
            nom="modeleId"
            libelle="Modèle"
            defaut={fiche.modeleId}
            options={modeles.map((m) => ({
              valeur: m.id,
              libelle: `${m.fabricant} – ${m.gamme} ${m.nom}`,
            }))}
          />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="referenceBonLivraison"
          libelle="Référence du bon de livraison"
          defaut={fiche.referenceBonLivraison}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="referenceFactureFabricant"
          libelle="Référence de la facture fabricant"
          defaut={fiche.referenceFactureFabricant}
        />
        {fiche.voitPrix ? (
          <ChampTexte
            etat={etat}
            nom="prixAchatCentimes"
            libelle="Prix d’achat (€)"
            defaut={prix}
          />
        ) : null}
      </div>
      <CaseACocher
        etat={etat}
        nom="enConsignation"
        libelle="Appareil en consignation"
        defaut={fiche.enConsignation}
      />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
