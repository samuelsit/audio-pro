'use client';

import {
  CLASSES_LPP,
  LIBELLES_CANAUX_MESSAGE,
  LIBELLES_CLASSES_LPP,
  LIBELLES_STATUTS_DOSSIER,
  STATUTS_DOSSIER,
  CANAUX_MESSAGE,
} from '@ha/domain';
import { useActionState, useRef, useState, useTransition } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

import type { ReponseComptage } from './actions';

interface OptionCentre {
  readonly id: string;
  readonly nom: string;
}

interface ProprietesCampagne {
  readonly action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  readonly compter: (formData: FormData) => Promise<ReponseComptage>;
  readonly centres: readonly OptionCentre[];
  readonly modeles: readonly { id: string; nom: string }[];
}

function CasesMultiples({
  nom,
  titre,
  options,
}: {
  nom: string;
  titre: string;
  options: readonly { valeur: string; libelle: string }[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{titre}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map(({ valeur, libelle }) => (
          <label key={valeur} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={nom} value={valeur} />
            {libelle}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormulaireCampagne({ action, compter, centres, modeles }: ProprietesCampagne) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const formulaire = useRef<HTMLFormElement>(null);
  const [reponse, setReponse] = useState<ReponseComptage>({});
  const [comptageEnCours, demarrerComptage] = useTransition();

  function lancerComptage(): void {
    if (formulaire.current) {
      const saisie = new FormData(formulaire.current);
      demarrerComptage(async () => {
        setReponse(await compter(saisie));
      });
    }
  }

  return (
    <form ref={formulaire} action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom de la campagne" requis />
      <ListeDeroulante
        etat={etat}
        nom="modeleId"
        libelle="Modèle"
        requis
        options={modeles.map((m) => ({ valeur: m.id, libelle: m.nom }))}
      />
      <ListeDeroulante
        etat={etat}
        nom="canal"
        libelle="Canal"
        requis
        options={CANAUX_MESSAGE.map((c) => ({ valeur: c, libelle: LIBELLES_CANAUX_MESSAGE[c] }))}
      />
      <CasesMultiples
        nom="centreIds"
        titre="Centres"
        options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="ageMin" libelle="Âge minimum" inputMode="numeric" />
        <ChampTexte etat={etat} nom="ageMax" libelle="Âge maximum" inputMode="numeric" />
        <ChampTexte etat={etat} nom="appareilleDepuis" libelle="Appareillé depuis le" type="date" />
        <ChampTexte etat={etat} nom="appareilleJusquAu" libelle="Appareillé jusqu’au" type="date" />
      </div>
      <CasesMultiples
        nom="classes"
        titre="Classe de l’appareil"
        options={CLASSES_LPP.map((c) => ({ valeur: c, libelle: LIBELLES_CLASSES_LPP[c] }))}
      />
      <CasesMultiples
        nom="statutsDossier"
        titre="Statut du dossier"
        options={STATUTS_DOSSIER.map((s) => ({ valeur: s, libelle: LIBELLES_STATUTS_DOSSIER[s] }))}
      />
      <ChampTexte
        etat={etat}
        nom="programmeeLe"
        libelle="Envoi programmé le"
        type="datetime-local"
        aide="Vide : dès que possible, dans la plage d’envoi."
      />
      {reponse.message ? <p className="text-sm text-destructive">{reponse.message}</p> : null}
      {reponse.comptage ? (
        <p role="status" className="text-sm">
          {reponse.comptage.destinataires} destinataires sur {reponse.comptage.total} patients du
          segment. Les autres n’ont pas donné leur consentement commercial sur ce canal, ou s’y sont
          opposés.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={comptageEnCours} onClick={lancerComptage}>
          Compter les destinataires
        </Button>
        <BoutonEnvoi>Programmer la campagne</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireComptesRendus({
  action,
  centres,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  centres: readonly OptionCentre[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="centreId"
        libelle="Centre"
        requis
        options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="du" libelle="Essais conclus du" type="date" requis />
        <ChampTexte etat={etat} nom="au" libelle="au" type="date" requis />
      </div>
      <div>
        <BoutonEnvoi>Préparer les comptes rendus</BoutonEnvoi>
      </div>
    </form>
  );
}
