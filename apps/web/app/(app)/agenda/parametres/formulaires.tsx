'use client';

import {
  LIBELLES_TYPES_EXCEPTION,
  LIBELLES_TYPES_RDV_ESSAI,
  LIBELLES_VALIDATIONS_RESERVATION,
  TYPES_EXCEPTION,
  TYPES_RDV_ESSAI,
  VALIDATIONS_RESERVATION,
  type HorairesOuverture,
} from '@ha/domain';
import { useActionState, useState } from 'react';

import { ChampsHoraires } from '@/components/champs-horaires';
import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { TypeRdvResume } from '@/server/services/agenda-parametres';
import type { ParametresReservationCentre } from '@/server/services/reservation-parametres';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

export function FormulaireCabine({ action }: { action: Action }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom de la cabine" requis />
      <div>
        <BoutonEnvoi>Ajouter la cabine</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireHoraires({
  action,
  horaires,
}: {
  action: Action;
  horaires: HorairesOuverture;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3">
      <MessageFormulaire etat={etat} />
      <ChampsHoraires etat={etat} legende="Horaires" erreur="horaires" horaires={horaires} />
      <div>
        <BoutonEnvoi>Enregistrer les horaires</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireType({ action, type }: { action: Action; type?: TypeRdvResume }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-3 sm:grid-cols-3">
        <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={type?.nom} requis />
        <ChampTexte
          etat={etat}
          nom="dureeMinutes"
          libelle="Durée (minutes)"
          inputMode="numeric"
          defaut={String(type?.dureeMinutes ?? 30)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="couleur"
          libelle="Couleur"
          defaut={type?.couleur ?? '#2563eb'}
          aide="#RRVVBB"
          requis
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <CaseACocher
          etat={etat}
          nom="requierePraticien"
          libelle="Requiert un praticien"
          defaut={type?.requierePraticien ?? true}
        />
        <CaseACocher
          etat={etat}
          nom="requiereCabine"
          libelle="Requiert une cabine"
          defaut={type?.requiereCabine ?? false}
        />
        <CaseACocher
          etat={etat}
          nom="reservableEnLigne"
          libelle="Réservable en ligne"
          defaut={type?.reservableEnLigne ?? false}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="delaiMinimalMinutes"
          libelle="Délai minimal de réservation (minutes)"
          inputMode="numeric"
          defaut={String(type?.delaiMinimalMinutes ?? 0)}
          requis
        />
        <ListeDeroulante
          etat={etat}
          nom="natureEssai"
          libelle="Étape d’essai"
          defaut={type?.natureEssai ?? ''}
          vide="Aucune"
          requis={false}
          options={TYPES_RDV_ESSAI.map((t) => ({
            valeur: t,
            libelle: LIBELLES_TYPES_RDV_ESSAI[t],
          }))}
        />
      </div>
      <div>
        <BoutonEnvoi>{type ? 'Enregistrer' : 'Ajouter le type'}</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireException({
  action,
  centreId,
  praticiens,
  cabines,
}: {
  action: Action;
  centreId: string;
  praticiens: readonly { id: string; nom: string }[];
  cabines: readonly { id: string; nom: string }[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [type, setType] = useState<string>('CONGE');
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3">
      <MessageFormulaire etat={etat} />
      <input
        type="hidden"
        name="centreCible"
        value={type === 'CONGE' || type === 'INDISPONIBILITE' ? '' : centreId}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="type"
          libelle="Type"
          defaut={type}
          surChangement={setType}
          options={TYPES_EXCEPTION.map((t) => ({
            valeur: t,
            libelle: LIBELLES_TYPES_EXCEPTION[t],
          }))}
        />
        {type === 'FERMETURE_CENTRE' ? null : (
          <ListeDeroulante
            etat={etat}
            nom="praticienId"
            libelle="Praticien"
            vide="Aucun"
            requis={false}
            options={praticiens.map((p) => ({ valeur: p.id, libelle: p.nom }))}
          />
        )}
        {type === 'INDISPONIBILITE' ? (
          <ListeDeroulante
            etat={etat}
            nom="cabineId"
            libelle="Cabine"
            vide="Aucune"
            requis={false}
            options={cabines.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <ChampTexte etat={etat} nom="du" libelle="Du" type="date" requis />
        <ChampTexte etat={etat} nom="au" libelle="Au" type="date" requis />
        <ChampTexte etat={etat} nom="heureDebut" libelle="De" type="time" />
        <ChampTexte etat={etat} nom="heureFin" libelle="À" type="time" />
      </div>
      <div>
        <BoutonEnvoi>Ajouter l’exception</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireReservation({
  action,
  parametres,
}: {
  action: Action;
  parametres: ParametresReservationCentre;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3">
      <MessageFormulaire etat={etat} />
      <CaseACocher
        etat={etat}
        nom="actif"
        libelle="Ouvrir la réservation en ligne pour ce centre"
        defaut={parametres.actif}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="delaiMinimalMinutes"
          libelle="Délai minimal (minutes)"
          inputMode="numeric"
          defaut={String(parametres.delaiMinimalMinutes)}
          aide="Le délai propre à chaque type s’applique s’il est plus long."
          requis
        />
        <ChampTexte
          etat={etat}
          nom="horizonJours"
          libelle="Horizon de réservation (jours)"
          inputMode="numeric"
          defaut={String(parametres.horizonJours)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="delaiModificationHeures"
          libelle="Annulation ou déplacement jusqu’à (heures avant)"
          inputMode="numeric"
          defaut={String(parametres.delaiModificationHeures)}
          requis
        />
        <ListeDeroulante
          etat={etat}
          nom="validation"
          libelle="Validation des rendez-vous"
          defaut={parametres.validation}
          options={VALIDATIONS_RESERVATION.map((v) => ({
            valeur: v,
            libelle: LIBELLES_VALIDATIONS_RESERVATION[v],
          }))}
        />
      </div>
      <fieldset className="grid gap-1">
        <legend className="text-sm font-medium">Types réservables</legend>
        {parametres.types.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="typeRdvIds"
              value={t.id}
              defaultChecked={t.retenu}
              className="size-4 accent-primary"
            />
            {t.nom}
          </label>
        ))}
      </fieldset>
      <ChampTexte
        etat={etat}
        nom="slug"
        libelle="Adresse du centre"
        defaut={parametres.slug}
        aide="Changer l’adresse invalide le lien et le widget déjà publiés."
        requis
      />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
