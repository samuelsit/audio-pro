'use client';

import {
  ESSAI_PROLONGATION_MAX_JOURS,
  LIBELLES_OREILLES,
  LIBELLES_TYPES_RDV_ESSAI,
  TYPES_DOCUMENT,
  TYPES_RDV_ESSAI,
  type Oreille,
  type StatutDossier,
} from '@ha/domain';
import { startTransition, useActionState, type FormEvent } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL } from '@/lib/formulaire';

import {
  ajouterRdvAction,
  changerAppareilAction,
  confirmerAchatAction,
  prolongerEssaiAction,
} from './actions';

const OPTIONS_TYPES = TYPES_RDV_ESSAI.map((valeur) => ({
  valeur,
  libelle: LIBELLES_TYPES_RDV_ESSAI[valeur],
}));

export function FormulaireRdv({ dossierId, jour }: { dossierId: string; jour: string }) {
  const [etat, envoyer] = useActionState(ajouterRdvAction.bind(null, dossierId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="date" libelle="Date" type="date" defaut={jour} requis />
      <ListeDeroulante
        etat={etat}
        nom="type"
        libelle="Type"
        vide="Choisir…"
        options={OPTIONS_TYPES}
      />
      <ZoneDeTexte etat={etat} nom="compteRendu" libelle="Compte rendu" lignes={2} requis />
      <div>
        <BoutonEnvoi variant="outline">Ajouter le rendez-vous</BoutonEnvoi>
      </div>
    </form>
  );
}

/** Envoi par `onSubmit`, comme la prescription : le fichier reste choisi après une erreur. */
export function FormulaireProlongation({ dossierId }: { dossierId: string }) {
  const [etat, envoyer, enCours] = useActionState(
    prolongerEssaiAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  const erreursFichier = etat.erreurs?.justificatif;

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    startTransition(() => envoyer(donnees));
  }

  return (
    <form onSubmit={soumettre} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="dateDemande" libelle="Date de la demande" type="date" requis />
      <ChampTexte
        etat={etat}
        nom="jours"
        libelle="Jours de prolongation"
        inputMode="numeric"
        defaut={String(ESSAI_PROLONGATION_MAX_JOURS.valeur)}
        aide="15 jours au plus, soit 45 jours d’essai au total."
        requis
      />
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" lignes={2} requis />
      <div className="grid gap-1.5">
        <Label htmlFor="justificatif">Demande écrite du prescripteur</Label>
        <Input
          id="justificatif"
          name="justificatif"
          type="file"
          required
          accept={TYPES_DOCUMENT.join(',')}
          aria-invalid={erreursFichier ? true : undefined}
          aria-describedby="justificatif-aide"
        />
        <p id="justificatif-aide" className="text-sm text-muted-foreground">
          PDF, JPEG ou PNG, 10 Mo au maximum.
        </p>
        {erreursFichier ? (
          <p className="text-sm text-destructive">{erreursFichier.join(' ')}</p>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la prolongation'}
        </Button>
      </div>
    </form>
  );
}

export function FormulaireChangement({
  dossierId,
  statut,
  oreilles,
  proposables,
}: {
  dossierId: string;
  statut: StatutDossier;
  oreilles: readonly Oreille[];
  proposables: readonly { numeroSerie: string; libelle: string }[];
}) {
  const [etat, envoyer] = useActionState(changerAppareilAction.bind(null, dossierId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <ListeDeroulante
        etat={etat}
        nom="oreille"
        libelle="Oreille"
        defaut={oreilles[0]}
        options={oreilles.map((valeur) => ({ valeur, libelle: LIBELLES_OREILLES[valeur] }))}
      />
      <datalist id="appareils-changement">
        {proposables.map((a) => (
          <option key={a.numeroSerie} value={a.numeroSerie}>
            {a.libelle}
          </option>
        ))}
      </datalist>
      <ChampTexte
        etat={etat}
        nom="numeroSerie"
        libelle="Numéro de série du nouvel appareil"
        autoComplete="off"
        suggestions="appareils-changement"
        requis
      />
      <ZoneDeTexte etat={etat} nom="motifRetrait" libelle="Motif du changement" lignes={2} requis />
      <div>
        <BoutonEnvoi variant="outline">Changer l’appareil</BoutonEnvoi>
      </div>
    </form>
  );
}

export function BoutonAchat({ dossierId, statut }: { dossierId: string; statut: StatutDossier }) {
  const [etat, envoyer] = useActionState(confirmerAchatAction.bind(null, dossierId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <div>
        <BoutonEnvoi>Confirmer l’achat</BoutonEnvoi>
      </div>
    </form>
  );
}
