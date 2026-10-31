'use client';

import { LIBELLES_ORIGINES_RDV, ORIGINES_RDV } from '@ha/domain';
import { useActionState, useEffect, useState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { TypeRdvResume } from '@/server/services/agenda-parametres';

import { creerRdvAction, dossiersDuPatientAction } from './actions';
import { ChoixPatient } from './choix-patient';

export interface ValeursRdv {
  date: string;
  heure: string;
  praticienId?: string | null | undefined;
  typeRdvId?: string | undefined;
}

export function FormulaireRdv({
  centreId,
  valeurs,
  types,
  praticiens,
  cabines,
  surSucces,
}: {
  centreId: string;
  valeurs: ValeursRdv;
  types: readonly TypeRdvResume[];
  praticiens: readonly { id: string; nom: string }[];
  cabines: readonly { id: string; nom: string }[];
  surSucces: () => void;
}) {
  const [etat, envoyer] = useActionState(creerRdvAction, ETAT_INITIAL);
  const actifs = types.filter((t) => t.actif);
  const [typeId, setTypeId] = useState(valeurs.typeRdvId ?? actifs[0]?.id ?? '');
  const [prospect, setProspect] = useState(false);
  const [dossiers, setDossiers] = useState<readonly { id: string; libelle: string }[]>([]);
  const type = actifs.find((t) => t.id === typeId);

  useEffect(() => {
    if (etat.succes) {
      surSucces();
    }
  }, [etat.succes, surSucces]);

  return (
    <form action={envoyer} className="grid gap-4 px-4 pb-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="centreId" value={centreId} />
      <ListeDeroulante
        etat={etat}
        nom="typeRdvId"
        libelle="Type"
        defaut={typeId}
        options={actifs.map((t) => ({ valeur: t.id, libelle: t.nom }))}
        surChangement={setTypeId}
      />
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Personne reçue</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="personne"
            checked={!prospect}
            onChange={() => {
              setProspect(false);
            }}
          />
          Patient
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="personne"
            checked={prospect}
            onChange={() => {
              setProspect(true);
            }}
          />
          Prospect
        </label>
      </fieldset>
      {prospect ? (
        <>
          <ChampTexte etat={etat} nom="prospectNom" libelle="Nom" requis />
          <ChampTexte etat={etat} nom="prospectTelephone" libelle="Téléphone" type="tel" requis />
        </>
      ) : (
        <>
          <ChoixPatient
            surChoix={(patient) => {
              setDossiers([]);
              if (patient) {
                void dossiersDuPatientAction(patient.id).then(setDossiers);
              }
            }}
          />
          {etat.erreurs?.prospectNom ? (
            <p className="text-sm text-destructive">{etat.erreurs.prospectNom.join(' ')}</p>
          ) : null}
          {dossiers.length > 0 ? (
            <ListeDeroulante
              etat={etat}
              nom="dossierId"
              libelle="Dossier d’appareillage (facultatif)"
              options={dossiers.map((d) => ({ valeur: d.id, libelle: d.libelle }))}
              vide="Aucun"
              requis={false}
            />
          ) : null}
        </>
      )}
      <div className="grid grid-cols-3 gap-2">
        <ChampTexte
          etat={etat}
          nom="date"
          libelle="Date"
          type="date"
          defaut={valeurs.date}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="heure"
          libelle="Heure"
          type="time"
          defaut={valeurs.heure}
          requis
        />
        <div className="grid gap-1.5">
          <Label htmlFor="dureeMinutes">Durée (min)</Label>
          <input
            key={typeId}
            id="dureeMinutes"
            name="dureeMinutes"
            type="number"
            min={5}
            step={5}
            defaultValue={type?.dureeMinutes ?? 30}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          />
        </div>
      </div>
      <ListeDeroulante
        etat={etat}
        nom="praticienId"
        libelle="Praticien"
        defaut={valeurs.praticienId ?? ''}
        options={praticiens.map((p) => ({ valeur: p.id, libelle: p.nom }))}
        vide={type?.requierePraticien === false ? 'Aucun' : 'Choisir…'}
        requis={type?.requierePraticien !== false}
      />
      {type?.requiereCabine ? (
        <ListeDeroulante
          etat={etat}
          nom="cabineId"
          libelle="Cabine"
          options={cabines.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          vide="Première libre"
          requis={false}
        />
      ) : null}
      <ListeDeroulante
        etat={etat}
        nom="origine"
        libelle="Origine"
        defaut="INTERNE"
        options={ORIGINES_RDV.filter((o) => o !== 'EN_LIGNE').map((o) => ({
          valeur: o,
          libelle: LIBELLES_ORIGINES_RDV[o],
        }))}
      />
      <ZoneDeTexte etat={etat} nom="notes" libelle="Notes" lignes={2} />
      {etat.conflitAgenda?.confirmable ? (
        <CaseACocher
          etat={etat}
          nom="confirmerHorsDisponibilites"
          libelle="Confirmer ce créneau malgré tout"
          defaut={false}
        />
      ) : null}
      <div>
        <BoutonEnvoi>Créer le rendez-vous</BoutonEnvoi>
      </div>
    </form>
  );
}
