'use client';

import {
  formatEuros,
  LIBELLES_MODES_PEC,
  LIBELLES_RESOLUTIONS_REJET,
  LIBELLES_TYPES_CREANCE,
  MODES_PEC,
  RESOLUTIONS_REJET,
  TYPES_CREANCE,
} from '@ha/domain';
import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { ComplementaireVue } from '@/server/services/complementaires';
import type { CreanceListee } from '@/server/services/tiers-payant';

import {
  annulerReglementAction,
  classerEcartAction,
  delettrerAction,
  enregistrerComplementaireAction,
  enregistrerEcartAction,
  enregistrerRejetAction,
  enregistrerReglementAction,
  lettrerAction,
  marquerRelanceeAction,
  resoudreRejetAction,
  transfererAction,
} from './actions';

type ActionFormulaire = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

function BoutonAction({
  action,
  libelle,
  variante,
}: {
  action: () => Promise<EtatFormulaire>;
  libelle: string;
  variante?: 'outline' | 'destructive';
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-1">
      <MessageFormulaire etat={etat} />
      <BoutonEnvoi {...(variante ? { variant: variante } : {})}>{libelle}</BoutonEnvoi>
    </form>
  );
}

const OPTIONS_TYPES = TYPES_CREANCE.map((valeur) => ({
  valeur,
  libelle: LIBELLES_TYPES_CREANCE[valeur],
}));

export function FormulaireReglement({
  centreId,
  jour,
  complementaires,
}: {
  centreId: string;
  jour: string;
  complementaires: readonly ComplementaireVue[];
}) {
  const [etat, envoyer] = useActionState(
    enregistrerReglementAction.bind(null, centreId),
    ETAT_INITIAL,
  );
  const [complementaireId, setComplementaireId] = useState('');
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="complementaireId"
        libelle="Complémentaire"
        vide="Caisse ou autre organisme"
        requis={false}
        options={complementaires
          .filter((c) => c.actif)
          .map((c) => ({ valeur: c.id, libelle: c.nom }))}
        surChangement={setComplementaireId}
      />
      {complementaireId === '' ? (
        <ChampTexte etat={etat} nom="organisme" libelle="Organisme" requis />
      ) : null}
      <ChampTexte
        etat={etat}
        nom="dateReglement"
        libelle="Date du virement"
        type="date"
        defaut={jour}
        requis
      />
      <ChampTexte etat={etat} nom="reference" libelle="Référence du virement" requis />
      <ChampTexte etat={etat} nom="partAmo" libelle="Part AMO (€)" />
      <ChampTexte
        etat={etat}
        nom="partAmc"
        libelle="Part AMC (€)"
        aide="Une caisse peut verser les deux parts d’un bénéficiaire de la C2S sur le même virement."
      />
      <div>
        <BoutonEnvoi>Enregistrer le virement</BoutonEnvoi>
      </div>
    </form>
  );
}

function montantSaisi(centimes: number): string {
  return (centimes / 100).toFixed(2).replace('.', ',');
}

export function FormulaireLettrage({
  reglementId,
  candidates,
}: {
  reglementId: string;
  candidates: readonly CreanceListee[];
}) {
  const [etat, envoyer] = useActionState(lettrerAction.bind(null, reglementId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organisme</TableHead>
            <TableHead>Part</TableHead>
            <TableHead>Facture</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Solde</TableHead>
            <TableHead>Montant à lettrer (€)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.organisme}</TableCell>
              <TableCell>{c.type}</TableCell>
              <TableCell>{c.numeroFacture}</TableCell>
              <TableCell>{c.patient}</TableCell>
              <TableCell>{formaterDate(c.dateEmission)}</TableCell>
              <TableCell className="text-right">{formatEuros(c.solde)}</TableCell>
              <TableCell>
                <input type="hidden" name="creanceId" value={c.id} />
                <Input
                  name="montant"
                  inputMode="decimal"
                  placeholder={montantSaisi(c.solde)}
                  aria-label={`Montant à lettrer sur ${c.numeroFacture ?? ''} ${c.type}`}
                  className="w-28"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <BoutonEnvoi>Lettrer</BoutonEnvoi>
      </div>
    </form>
  );
}

export function BoutonDelettrer({ lettrageId }: { lettrageId: string }) {
  return (
    <BoutonAction
      action={delettrerAction.bind(null, lettrageId)}
      libelle="Délettrer"
      variante="outline"
    />
  );
}

export function BoutonRelance({ creanceId }: { creanceId: string }) {
  return (
    <BoutonAction
      action={marquerRelanceeAction.bind(null, creanceId)}
      libelle="Noter la relance"
      variante="outline"
    />
  );
}

function FormulaireMotif({
  action,
  bouton,
  avecMontant = false,
  montantDefaut,
  avecType = false,
  variante,
}: {
  action: ActionFormulaire;
  bouton: string;
  avecMontant?: boolean;
  montantDefaut?: string;
  avecType?: boolean;
  variante?: 'outline' | 'destructive';
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      {avecType ? (
        <ListeDeroulante
          etat={etat}
          nom="type"
          libelle="Part"
          options={OPTIONS_TYPES}
          vide="Choisir…"
        />
      ) : null}
      {avecMontant ? (
        <ChampTexte etat={etat} nom="montant" libelle="Montant (€)" defaut={montantDefaut} requis />
      ) : null}
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" requis />
      <div>
        <BoutonEnvoi {...(variante ? { variant: variante } : {})}>{bouton}</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireAnnulationReglement({ reglementId }: { reglementId: string }) {
  return (
    <FormulaireMotif
      action={annulerReglementAction.bind(null, reglementId)}
      bouton="Annuler le règlement"
      variante="destructive"
    />
  );
}

export function FormulaireEcartReglement({ reglementId }: { reglementId: string }) {
  return (
    <FormulaireMotif
      action={classerEcartAction.bind(null, reglementId)}
      bouton="Classer en produit"
      avecMontant
      avecType
      variante="outline"
    />
  );
}

export function FormulaireEcartCreance({ creanceId, solde }: { creanceId: string; solde: number }) {
  return (
    <FormulaireMotif
      action={enregistrerEcartAction.bind(null, creanceId)}
      bouton="Passer en perte"
      avecMontant
      montantDefaut={montantSaisi(solde)}
      variante="outline"
    />
  );
}

export function FormulaireTransfert({ creanceId, solde }: { creanceId: string; solde: number }) {
  return (
    <FormulaireMotif
      action={transfererAction.bind(null, creanceId)}
      bouton="Transférer au patient"
      avecMontant
      montantDefaut={montantSaisi(solde)}
      variante="outline"
    />
  );
}

export function FormulaireRejet({ creanceId, jour }: { creanceId: string; jour: string }) {
  const [etat, envoyer] = useActionState(
    enregistrerRejetAction.bind(null, creanceId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="dateRejet" libelle="Date" type="date" defaut={jour} requis />
      <ChampTexte etat={etat} nom="code" libelle="Code de rejet" />
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" requis />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer le rejet</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireResolution({
  rejetId,
  regulariser,
}: {
  rejetId: string;
  regulariser: boolean;
}) {
  const [etat, envoyer] = useActionState(resoudreRejetAction.bind(null, rejetId), ETAT_INITIAL);
  const options = RESOLUTIONS_REJET.filter((r) => regulariser || r === 'REPRESENTEE').map(
    (valeur) => ({ valeur, libelle: LIBELLES_RESOLUTIONS_REJET[valeur] }),
  );
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="resolution"
        libelle="Suite donnée"
        options={options}
        vide="Choisir…"
        requis
      />
      <div>
        <BoutonEnvoi variant="outline">Traiter</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireComplementaire({
  complementaire,
}: {
  complementaire?: ComplementaireVue;
}) {
  const [etat, envoyer] = useActionState(
    enregistrerComplementaireAction.bind(null, complementaire?.id ?? null),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={complementaire?.nom} requis />
      <ChampTexte
        etat={etat}
        nom="identifiant"
        libelle="Identifiant"
        defaut={complementaire?.identifiant}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="plateformeTiersPayant"
        libelle="Plateforme de tiers payant"
        defaut={complementaire?.plateformeTiersPayant}
      />
      <ChampTexte
        etat={etat}
        nom="telephone"
        libelle="Téléphone"
        defaut={complementaire?.telephone}
      />
      <ChampTexte
        etat={etat}
        nom="email"
        libelle="E-mail"
        type="email"
        defaut={complementaire?.email}
      />
      <ChampTexte etat={etat} nom="adresse" libelle="Adresse" defaut={complementaire?.adresse} />
      <ListeDeroulante
        etat={etat}
        nom="modePec"
        libelle="Mode de PEC"
        defaut={complementaire?.modePec ?? 'PORTAIL'}
        options={MODES_PEC.map((valeur) => ({ valeur, libelle: LIBELLES_MODES_PEC[valeur] }))}
      />
      <ChampTexte
        etat={etat}
        nom="delaiPaiementJours"
        libelle="Délai de paiement attendu (jours)"
        defaut={String(complementaire?.delaiPaiementJours ?? 30)}
        inputMode="numeric"
        requis
      />
      <CaseACocher
        etat={etat}
        nom="actif"
        libelle="Active"
        defaut={complementaire?.actif ?? true}
      />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
