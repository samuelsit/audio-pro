'use client';

import {
  LIBELLES_OREILLES,
  LIBELLES_RUBRIQUES_OFFRE,
  TYPES_DOCUMENT,
  type Oreille,
  type RubriqueOffre,
  type StatutDevis,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

import { ListeConstats } from '../liste-constats';
import {
  demarrerEssaiAction,
  deposerScanAction,
  emettreDevisAction,
  enregistrerSignatureAction,
  nouvelleVersionAction,
  supprimerBrouillonAction,
} from './actions';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

function BoutonAction({
  action,
  statut,
  libelle,
  variante,
}: {
  action: Action;
  statut: StatutDevis;
  libelle: string;
  variante?: 'outline' | 'destructive';
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      {etat.blocageDevis ? (
        <Alert variant="destructive">
          <AlertTitle>Points bloquants</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={etat.blocageDevis.erreurs} />
          </AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="statutAttendu" value={statut} />
      <div>
        <BoutonEnvoi variant={variante}>{libelle}</BoutonEnvoi>
      </div>
    </form>
  );
}

interface Identifiants {
  dossierId: string;
  devisId: string;
  statut: StatutDevis;
}

export function BoutonEmettre({ dossierId, devisId, statut }: Identifiants) {
  return (
    <BoutonAction
      action={emettreDevisAction.bind(null, dossierId, devisId)}
      statut={statut}
      libelle="Émettre le devis"
    />
  );
}

export function BoutonNouvelleVersion({ dossierId, devisId, statut }: Identifiants) {
  return (
    <BoutonAction
      action={nouvelleVersionAction.bind(null, dossierId, devisId)}
      statut={statut}
      libelle="Nouvelle version"
      variante="outline"
    />
  );
}

export function BoutonSupprimer({ dossierId, devisId, statut }: Identifiants) {
  return (
    <BoutonAction
      action={supprimerBrouillonAction.bind(null, dossierId, devisId)}
      statut={statut}
      libelle="Supprimer le brouillon"
      variante="outline"
    />
  );
}

function optionsOffres(rubriques: readonly RubriqueOffre[]) {
  return rubriques.map((r) => ({ valeur: r, libelle: LIBELLES_RUBRIQUES_OFFRE[r] }));
}

const CHAMPS_NUMERO_SERIE: Readonly<Record<Oreille, string>> = {
  DROITE: 'numeroSerieDroite',
  GAUCHE: 'numeroSerieGauche',
};

export function FormulaireEssai({
  dossierId,
  devisId,
  statut,
  rubriques,
  oreilles,
  proposables,
}: Identifiants & {
  rubriques: readonly RubriqueOffre[];
  oreilles: readonly Oreille[];
  proposables: readonly { numeroSerie: string; libelle: string }[];
}) {
  const [etat, envoyer] = useActionState(
    demarrerEssaiAction.bind(null, dossierId, devisId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <ListeDeroulante
        etat={etat}
        nom="offreEssai"
        libelle="Offre choisie pour l’essai"
        vide="Choisir…"
        options={optionsOffres(rubriques)}
      />
      <datalist id="appareils-essai">
        {proposables.map((a) => (
          <option key={a.numeroSerie} value={a.numeroSerie}>
            {a.libelle}
          </option>
        ))}
      </datalist>
      {oreilles.map((oreille) => (
        <ChampTexte
          key={oreille}
          etat={etat}
          nom={CHAMPS_NUMERO_SERIE[oreille]}
          libelle={`Numéro de série, ${LIBELLES_OREILLES[oreille].toLowerCase()}`}
          autoComplete="off"
          suggestions="appareils-essai"
          requis
        />
      ))}
      <div>
        <BoutonEnvoi>Démarrer l’essai</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireScan({ dossierId, devisId, statut }: Identifiants) {
  const [etat, envoyer] = useActionState(
    deposerScanAction.bind(null, dossierId, devisId),
    ETAT_INITIAL,
  );
  const erreurs = etat.erreurs?.scan;
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <div className="grid gap-1.5">
        <Label htmlFor="scan">Devis signé scanné</Label>
        <Input
          id="scan"
          name="scan"
          type="file"
          accept={TYPES_DOCUMENT.join(',')}
          aria-invalid={erreurs ? true : undefined}
          required
        />
        {erreurs ? <p className="text-sm text-destructive">{erreurs.join(' ')}</p> : null}
      </div>
      <div>
        <BoutonEnvoi variant="outline">Déposer le scan</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireSignature({
  dossierId,
  devisId,
  statut,
  rubriques,
  jour,
}: Identifiants & { rubriques: readonly RubriqueOffre[]; jour: string }) {
  const [etat, envoyer] = useActionState(
    enregistrerSignatureAction.bind(null, dossierId, devisId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <ListeDeroulante
        etat={etat}
        nom="offreRetenue"
        libelle="Offre choisie à l’issue de l’essai"
        vide="Choisir…"
        options={optionsOffres(rubriques)}
      />
      <ChampTexte
        etat={etat}
        nom="dateSignature"
        libelle="Date de signature"
        type="date"
        defaut={jour}
        requis
      />
      <CaseACocher etat={etat} nom="signe" libelle="Signé par le patient" defaut={false} />
      <div>
        <BoutonEnvoi>Enregistrer la signature</BoutonEnvoi>
      </div>
    </form>
  );
}
