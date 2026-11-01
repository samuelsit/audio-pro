'use client';

import {
  LIBELLES_STATUTS_PEC,
  STATUTS_PEC,
  TYPES_DOCUMENT,
  type LigneDemandePec,
  type StatutPec,
} from '@ha/domain';
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
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { ComplementaireVue } from '@/server/services/complementaires';
import type { PecAffichee } from '@/server/services/factures';

import {
  actualiserPecAction,
  confirmerCouvertureAction,
  demanderPecAction,
  enregistrerPecAction,
  validerFactureAction,
} from './actions';

const OPTIONS_STATUTS = STATUTS_PEC.map((valeur) => ({
  valeur,
  libelle: LIBELLES_STATUTS_PEC[valeur],
}));

export function BoutonValidation({
  dossierId,
  factureId,
}: {
  dossierId: string;
  factureId: string;
}) {
  const [etat, envoyer] = useActionState(
    validerFactureAction.bind(null, dossierId, factureId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi>Valider la facture</BoutonEnvoi>
      </div>
      <p className="text-sm text-muted-foreground">
        La facture reçoit son numéro et ne se modifie plus. Sa date marque la délivrance.
      </p>
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

/** Offre d'un devis dont la demande reprend les postes. */
export interface OffreDemandee {
  rubrique: string;
  libelle: string;
  lignes: readonly LigneDemandePec[];
}

function ChampsDemande({
  etat,
  lignes,
}: {
  etat: EtatFormulaire;
  lignes: readonly LigneDemandePec[];
}) {
  if (lignes.length === 0) {
    return null;
  }
  const erreurs = etat.erreurs?.demande;
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">Montants demandés</legend>
      {lignes.map((ligne, rang) => (
        <div key={`${ligne.libelle}-${String(rang)}`} className="grid gap-1.5">
          <Label htmlFor={`pec-demande-${String(rang)}`}>{ligne.libelle}</Label>
          <input type="hidden" name="demandeLibelle" value={ligne.libelle} />
          <input type="hidden" name="demandeCodeLpp" value={ligne.codeLpp ?? ''} />
          <input type="hidden" name="demandePrix" value={ligne.prixTtcCentimes} />
          <input type="hidden" name="demandeAmo" value={ligne.amoCentimes} />
          <Input
            id={`pec-demande-${String(rang)}`}
            name="demandeMontant"
            inputMode="decimal"
            defaultValue={montantSaisi(ligne.montantDemandeCentimes)}
          />
        </div>
      ))}
      {erreurs ? <p className="text-sm text-destructive">{erreurs.join(' ')}</p> : null}
    </fieldset>
  );
}

/** Envoi par `onSubmit`, comme la prolongation : le fichier reste choisi après une erreur. */
export function FormulairePec({
  dossierId,
  pec,
  complementaires = [],
  devisId,
  offres = [],
}: {
  dossierId: string;
  pec: PecAffichee | null;
  complementaires?: readonly ComplementaireVue[];
  /** Saisie depuis le devis : la demande reprend une de ses offres. */
  devisId?: string;
  offres?: readonly OffreDemandee[];
}) {
  const [etat, envoyer, enCours] = useActionState(
    enregistrerPecAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  const [statut, setStatut] = useState<string>(pec?.statut ?? '');
  const [complementaireId, setComplementaireId] = useState(pec?.complementaireId ?? '');
  const [rubrique, setRubrique] = useState(pec?.offre ?? offres[0]?.rubrique ?? '');
  const erreursFichier = etat.erreurs?.justificatif;
  const sansTiersPayant = statut === ('SANS_TIERS_PAYANT' satisfies StatutPec);
  const accordee =
    statut === ('ACCORDEE' satisfies StatutPec) || statut === ('PARTIELLE' satisfies StatutPec);
  const aDemander = statut === ('A_DEMANDER' satisfies StatutPec);
  const offreChoisie = offres.find((o) => o.rubrique === rubrique);
  const lignes =
    pec && pec.demande.length > 0 && (pec.offre === rubrique || !offreChoisie)
      ? pec.demande
      : (offreChoisie?.lignes ?? pec?.demande ?? []);

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
          {complementaires.length > 0 ? (
            <ListeDeroulante
              etat={etat}
              nom="complementaireId"
              libelle="Complémentaire"
              vide="Hors référentiel"
              requis={false}
              defaut={pec?.complementaireId ?? undefined}
              options={complementaires
                .filter((c) => c.actif || c.id === pec?.complementaireId)
                .map((c) => ({ valeur: c.id, libelle: c.nom }))}
              surChangement={setComplementaireId}
            />
          ) : null}
          {complementaireId === '' ? (
            <ChampTexte
              etat={etat}
              nom="organisme"
              libelle="Organisme"
              defaut={pec?.organisme}
              requis
            />
          ) : null}
          <ChampTexte etat={etat} nom="plateforme" libelle="Plateforme" defaut={pec?.plateforme} />
          <ChampTexte
            etat={etat}
            nom="numeroAdherent"
            libelle="Numéro d’adhérent"
            defaut={pec?.numeroAdherent}
          />
          {devisId ? <input type="hidden" name="devisId" value={devisId} /> : null}
          {offres.length > 1 ? (
            <ListeDeroulante
              etat={etat}
              nom="offre"
              libelle="Offre concernée"
              defaut={rubrique}
              options={offres.map((o) => ({ valeur: o.rubrique, libelle: o.libelle }))}
              surChangement={setRubrique}
            />
          ) : (
            <input type="hidden" name="offre" value={rubrique} />
          )}
          <ChampsDemande key={rubrique} etat={etat} lignes={lignes} />
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
            aide="Date de la demande ou de la réponse."
            type="date"
            defaut={pec?.datePec}
            requis={!aDemander}
          />
          <ChampTexte
            etat={etat}
            nom="validiteFin"
            libelle="Valable jusqu’au"
            type="date"
            defaut={pec?.validiteFin}
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

/** Port `PecGateway` : demande ou relecture auprès de la plateforme, en simulation jusqu'à l'étape 28. */
export function BoutonsPlateformePec({
  dossierId,
  reference,
}: {
  dossierId: string;
  reference: string | null;
}) {
  const [etat, envoyer] = useActionState(
    (reference ? actualiserPecAction : demanderPecAction).bind(null, dossierId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi variant="outline">
          {reference ? 'Actualiser la réponse' : 'Demander par la plateforme'}
        </BoutonEnvoi>
      </div>
    </form>
  );
}
