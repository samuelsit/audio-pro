'use client';

import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { ModeleResume } from '@/server/services/catalogue';

import { recevoirAction } from '../actions';
import { SaisieNumerosSerie } from './saisie-numeros-serie';

export function FormulaireReception({
  centres,
  centreId,
  modeles,
  aujourdhui,
  saisitPrix,
}: {
  centres: readonly { id: string; nom: string }[];
  centreId: string | undefined;
  modeles: readonly ModeleResume[];
  aujourdhui: string;
  saisitPrix: boolean;
}) {
  const [etat, envoyer] = useActionState(recevoirAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="centreId"
          libelle="Centre"
          vide="Choisir un centre…"
          defaut={centreId}
          options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
        />
        <ListeDeroulante
          etat={etat}
          nom="modeleId"
          libelle="Modèle"
          vide="Choisir un modèle…"
          options={modeles.map((m) => ({
            valeur: m.id,
            libelle: `${m.fabricant} – ${m.gamme} ${m.nom}`,
          }))}
        />
        <ChampTexte
          etat={etat}
          nom="referenceBonLivraison"
          libelle="Référence du bon de livraison"
          requis
        />
        <ChampTexte
          etat={etat}
          nom="referenceFactureFabricant"
          libelle="Référence de la facture fabricant"
          aide="Peut être saisie plus tard sur la fiche de l’appareil."
        />
        <ChampTexte
          etat={etat}
          nom="dateReception"
          libelle="Date de réception"
          type="date"
          defaut={aujourdhui}
          requis
        />
        {saisitPrix ? (
          <ChampTexte etat={etat} nom="prixAchatCentimes" libelle="Prix d’achat unitaire (€)" />
        ) : null}
      </div>
      <CaseACocher
        etat={etat}
        nom="enConsignation"
        libelle="Appareils en consignation"
        defaut={false}
      />
      <SaisieNumerosSerie erreurs={etat.erreurs?.['numerosSerie']} />
      <div>
        <BoutonEnvoi>Enregistrer la réception</BoutonEnvoi>
      </div>
    </form>
  );
}
