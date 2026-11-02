'use client';

import {
  analyserSms,
  JOURS_SEMAINE,
  LIBELLES_JOURS,
  LIBELLES_VARIABLES,
  rendreTexte,
  variablesAdmises,
  type ParametresCommunication,
  type ScenarioCommunication,
  type TextesModele,
} from '@ha/domain';
import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

const EXEMPLE = {
  prenom: 'Marie',
  centre: 'Votre centre',
  telephoneCentre: '01 02 03 04 05',
  dateRdv: 'mardi 2 février',
  heureRdv: '14h30',
  lien: 'https://exemple.test/l/AbCdEfGhIjKl',
};

export function FormulaireParametres({
  action,
  parametres,
}: {
  action: Action;
  parametres: ParametresCommunication;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="heureDebut"
          libelle="Envois à partir de"
          type="time"
          defaut={parametres.heureDebut}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="heureFin"
          libelle="Envois jusqu’à"
          type="time"
          defaut={parametres.heureFin}
          requis
        />
      </div>
      <div className="flex flex-wrap gap-4">
        {JOURS_SEMAINE.map((jour) => (
          <CaseACocher
            key={jour}
            etat={etat}
            nom={jour}
            libelle={LIBELLES_JOURS[jour]}
            defaut={parametres.jours.includes(jour)}
          />
        ))}
        <CaseACocher etat={etat} nom="feries" libelle="Jours fériés" defaut={parametres.feries} />
      </div>
      <ChampTexte
        etat={etat}
        nom="tarifSmsMillimes"
        libelle="Tarif d’un crédit SMS (millièmes d’euro)"
        inputMode="numeric"
        defaut={String(parametres.tarifSmsMillimes)}
        requis
        aide="45 pour 4,5 centimes. Sert au calcul du coût par centre."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="devisDelaiJours"
          libelle="Relance d’un devis tous les (jours)"
          inputMode="numeric"
          defaut={String(parametres.devisDelaiJours)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="devisRelancesMax"
          libelle="Relances d’un devis au plus"
          inputMode="numeric"
          defaut={String(parametres.devisRelancesMax)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="finEssaiAvanceJours"
          libelle="Fin d’essai : prévenir à (jours)"
          inputMode="numeric"
          defaut={String(parametres.finEssaiAvanceJours)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="controleAvanceJours"
          libelle="Contrôle : prévenir à (jours)"
          inputMode="numeric"
          defaut={String(parametres.controleAvanceJours)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="garantieAvanceJours"
          libelle="Fin de garantie : prévenir à (jours)"
          inputMode="numeric"
          defaut={String(parametres.garantieAvanceJours)}
          requis
        />
        <ChampTexte
          etat={etat}
          nom="renouvellementFenetreJours"
          libelle="Renouvellement : inviter pendant (jours)"
          inputMode="numeric"
          defaut={String(parametres.renouvellementFenetreJours)}
          requis
        />
      </div>
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireModele({
  action,
  nom,
  scenario,
  textes,
}: {
  action: Action;
  nom: string;
  scenario: ScenarioCommunication | null;
  textes: TextesModele;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [sms, setSms] = useState(textes.corpsSms);
  const rendu = rendreTexte(sms, EXEMPLE);
  const { caracteres, segments, encodage } = analyserSms(rendu);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="scenario" value={scenario ?? ''} />
      <p className="text-sm text-muted-foreground">
        Variables :{' '}
        {variablesAdmises(scenario)
          .map((v) => `{${v}} (${LIBELLES_VARIABLES[v].toLowerCase()})`)
          .join(', ')}
        . Ni le SMS ni l’e-mail ne disent quoi que ce soit de la santé du patient.
      </p>
      <ChampTexte etat={etat} nom="nom" libelle="Nom du modèle" defaut={nom} requis />
      <ChampTexte etat={etat} nom="sujet" libelle="Sujet" defaut={textes.sujet} requis />
      <ZoneDeTexte
        etat={etat}
        nom="corpsEmail"
        libelle="E-mail"
        defaut={textes.corpsEmail}
        requis
      />
      <div className="grid gap-1.5">
        <Label htmlFor="corpsSms">Version SMS</Label>
        <textarea
          id="corpsSms"
          name="corpsSms"
          rows={3}
          required
          value={sms}
          onChange={(e) => {
            setSms(e.target.value);
          }}
          aria-invalid={etat.erreurs?.corpsSms ? true : undefined}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        {etat.erreurs?.corpsSms?.map((m) => (
          <p key={m} className="text-sm text-destructive">
            {m}
          </p>
        ))}
        <p className="text-sm text-muted-foreground">
          Aperçu : {rendu} — {caracteres} caractères, {segments}{' '}
          {segments > 1 ? 'segments' : 'segment'}
          {encodage === 'UNICODE' ? ', en Unicode (plus court : évitez ê, â, ç, ’)' : ''}. La
          mention STOP est ajoutée à l’envoi.
        </p>
      </div>
      <ZoneDeTexte
        etat={etat}
        nom="corpsCourrier"
        libelle="Lettre"
        defaut={textes.corpsCourrier ?? ''}
      />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
