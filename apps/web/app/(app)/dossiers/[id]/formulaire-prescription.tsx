'use client';

import {
  LIBELLES_OREILLES_DOSSIER,
  OREILLES_DOSSIER,
  TYPES_DOCUMENT,
  type OreillesDossier,
  type StatutDossier,
} from '@ha/domain';
import { startTransition, useActionState, type FormEvent } from 'react';

import {
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { SelecteurPrescripteur } from '../../prescripteurs/selecteur-prescripteur';
import { enregistrerPrescriptionAction } from '../actions';
import { ListeConstats } from './liste-constats';

const OPTIONS_OREILLES = OREILLES_DOSSIER.map((valeur) => ({
  valeur,
  libelle: LIBELLES_OREILLES_DOSSIER[valeur],
}));

/**
 * Envoi par `onSubmit` : un formulaire branché sur `action` est réinitialisé par React après chaque
 * envoi, et l'ADMIN_CLIENT qui force devrait choisir à nouveau le fichier du scan. La saisie reste en place.
 */
export function FormulairePrescription({
  dossierId,
  statut,
  oreilles,
}: {
  dossierId: string;
  statut: StatutDossier;
  oreilles: OreillesDossier;
}) {
  const [etat, envoyer, enCours] = useActionState(
    enregistrerPrescriptionAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  const { blocage } = etat;
  const erreursScan = etat.erreurs?.scan;

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const { currentTarget, nativeEvent } = evenement;
    const { submitter } = nativeEvent as SubmitEvent;
    const donnees = new FormData(currentTarget, submitter);
    startTransition(() => envoyer(donnees));
  }

  return (
    <form onSubmit={soumettre} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <SelecteurPrescripteur />
      <ChampTexte
        etat={etat}
        nom="datePrescription"
        libelle="Date de la prescription"
        type="date"
        requis
      />
      <ListeDeroulante
        etat={etat}
        nom="oreilles"
        libelle="Oreilles prescrites"
        options={OPTIONS_OREILLES}
        defaut={oreilles}
      />
      <CaseACocher
        etat={etat}
        nom="mentionRenouvellement"
        libelle="Mention de renouvellement sur l’ordonnance"
        defaut={false}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="scan">Scan de l’ordonnance</Label>
        <Input
          id="scan"
          name="scan"
          type="file"
          required
          accept={TYPES_DOCUMENT.join(',')}
          aria-invalid={erreursScan ? true : undefined}
          aria-describedby="scan-aide"
        />
        <p id="scan-aide" className="text-sm text-muted-foreground">
          PDF, JPEG ou PNG, 10 Mo au maximum.
        </p>
        {erreursScan ? <p className="text-sm text-destructive">{erreursScan.join(' ')}</p> : null}
      </div>

      {blocage ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Erreurs bloquantes</AlertTitle>
          <AlertDescription className="grid gap-2">
            <ListeConstats
              constats={blocage.controle.erreurs}
              refus={blocage.controle.refusRenouvellement}
            />
            {blocage.forcable ? null : (
              <p>Seul un administrateur peut enregistrer cette prescription malgré ces erreurs.</p>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {blocage && blocage.controle.avertissements.length > 0 ? (
        <Alert>
          <AlertTitle>Avertissements</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={blocage.controle.avertissements} />
          </AlertDescription>
        </Alert>
      ) : null}
      {blocage?.forcable ? (
        <ZoneDeTexte
          etat={etat}
          nom="motifForcage"
          libelle="Motif du forçage"
          lignes={3}
          requis
          aide="Conservé chiffré sur la prescription. Le journal d’audit trace le forçage, sans ce texte."
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {blocage?.forcable ? (
          <Button type="submit" variant="destructive" name="forcer" value="on" disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer malgré tout'}
          </Button>
        ) : (
          <Button type="submit" disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer la prescription'}
          </Button>
        )}
      </div>
    </form>
  );
}
