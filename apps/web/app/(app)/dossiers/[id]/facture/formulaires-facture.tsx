'use client';

import { LIBELLES_STATUTS_PEC, STATUTS_PEC, TYPES_DOCUMENT, type StatutPec } from '@ha/domain';
import { startTransition, useActionState, useState, type FormEvent } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { PecAffichee } from '@/server/services/factures';

import {
  confirmerCouvertureAction,
  enregistrerPecAction,
  modifierDateDelivranceAction,
} from './actions';

const OPTIONS_STATUTS = STATUTS_PEC.map((valeur) => ({
  valeur,
  libelle: LIBELLES_STATUTS_PEC[valeur],
}));

export function FormulaireDateDelivrance({
  dossierId,
  dateDelivrance,
}: {
  dossierId: string;
  dateDelivrance: string;
}) {
  const [etat, envoyer] = useActionState(
    modifierDateDelivranceAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="dateDelivrance"
        libelle="Date de délivrance"
        type="date"
        defaut={dateDelivrance}
        aide="Remise de l’aide, à l’issue de l’essai. Base, âge, droits et tarifs se lisent à cette date."
        requis
      />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer la date</BoutonEnvoi>
      </div>
    </form>
  );
}

export function BoutonConfirmationAmo({ dossierId }: { dossierId: string }) {
  const [etat, envoyer] = useActionState(
    confirmerCouvertureAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi variant="outline">Confirmer la couverture saisie</BoutonEnvoi>
      </div>
    </form>
  );
}

function montantSaisi(centimes: number | null | undefined): string {
  return centimes == null ? '' : (centimes / 100).toFixed(2).replace('.', ',');
}

/** Envoi par `onSubmit`, comme la prolongation : le fichier reste choisi après une erreur. */
export function FormulairePec({ dossierId, pec }: { dossierId: string; pec: PecAffichee | null }) {
  const [etat, envoyer, enCours] = useActionState(
    enregistrerPecAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  const [statut, setStatut] = useState<string>(pec?.statut ?? '');
  const erreursFichier = etat.erreurs?.justificatif;
  const sansTiersPayant = statut === ('SANS_TIERS_PAYANT' satisfies StatutPec);
  const accordee = statut === ('ACCORDEE' satisfies StatutPec);

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    startTransition(() => envoyer(donnees));
  }

  return (
    <form onSubmit={soumettre} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="statut"
        libelle="Statut de la prise en charge"
        vide="Choisir…"
        defaut={pec?.statut}
        options={OPTIONS_STATUTS}
        surChangement={setStatut}
      />
      {sansTiersPayant ? null : (
        <>
          <ChampTexte
            etat={etat}
            nom="organisme"
            libelle="Organisme"
            defaut={pec?.organisme}
            requis
          />
          <ChampTexte etat={etat} nom="plateforme" libelle="Plateforme" defaut={pec?.plateforme} />
          <ChampTexte
            etat={etat}
            nom="numeroAccord"
            libelle="Numéro d’accord"
            defaut={pec?.numeroAccord}
            requis={accordee}
          />
          {accordee ? (
            <ChampTexte
              etat={etat}
              nom="montantAccorde"
              libelle="Montant accordé (€)"
              defaut={montantSaisi(pec?.montantAccordeCentimes)}
              aide="Montant du dossier, réparti entre les lignes."
              requis
            />
          ) : null}
          <ChampTexte
            etat={etat}
            nom="datePec"
            libelle="Date"
            type="date"
            defaut={pec?.datePec}
            requis
          />
          <div className="grid gap-1.5">
            <Label htmlFor="pec-justificatif">
              Justificatif <span className="font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="pec-justificatif"
              name="justificatif"
              type="file"
              accept={TYPES_DOCUMENT.join(',')}
              aria-invalid={erreursFichier ? true : undefined}
              aria-describedby="pec-justificatif-aide"
            />
            <p id="pec-justificatif-aide" className="text-sm text-muted-foreground">
              PDF, JPEG ou PNG, 10 Mo au maximum.
              {pec?.justificatif ? ' Un nouveau fichier remplace le précédent.' : ''}
            </p>
            {erreursFichier ? (
              <p className="text-sm text-destructive">{erreursFichier.join(' ')}</p>
            ) : null}
          </div>
        </>
      )}
      <div>
        <Button type="submit" variant="outline" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la prise en charge'}
        </Button>
      </div>
    </form>
  );
}
