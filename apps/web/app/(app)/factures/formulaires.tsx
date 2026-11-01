'use client';

import {
  LIBELLES_NATURES_LIGNE_FACTURE,
  NATURES_LIGNE_SAISIE,
  type CanalNotification,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { LigneDetail } from '@/server/services/facturation';

import {
  actualiserFseAction,
  ajouterLigneAction,
  confirmerCouvertureAction,
  creerVenteDirecteAction,
  emettreAvoirAction,
  envoyerFactureAction,
  modifierTiersPayantAction,
  preparerFseAction,
  validerAction,
} from './actions';

export function FormulaireVenteDirecte({
  patientId,
  centres,
  prescriptions,
}: {
  patientId: string;
  centres: readonly { id: string; nom: string }[];
  prescriptions: readonly { id: string; libelle: string }[];
}) {
  const [etat, envoyer] = useActionState(creerVenteDirecteAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="patientId" value={patientId} />
      <ListeDeroulante
        etat={etat}
        nom="centreId"
        libelle="Centre"
        vide="Choisir…"
        options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
      />
      <ListeDeroulante
        etat={etat}
        nom="prescriptionId"
        libelle="Prescription (ouvre le remboursement des lignes LPP)"
        vide="Sans prescription : tout en reste à charge"
        requis={false}
        options={prescriptions.map((p) => ({ valeur: p.id, libelle: p.libelle }))}
      />
      <div>
        <BoutonEnvoi>Ouvrir la vente</BoutonEnvoi>
      </div>
    </form>
  );
}

const LIBELLES_CANAUX: Readonly<Record<CanalNotification, string>> = {
  SMS: 'SMS',
  EMAIL: 'E-mail',
};

const OPTIONS_NATURES = NATURES_LIGNE_SAISIE.map((valeur) => ({
  valeur,
  libelle: LIBELLES_NATURES_LIGNE_FACTURE[valeur],
}));

export function FormulaireLigne({
  factureId,
  accessoires,
}: {
  factureId: string;
  accessoires: readonly { id: string; nom: string }[];
}) {
  const [etat, envoyer] = useActionState(ajouterLigneAction.bind(null, factureId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="nature"
        libelle="Type de ligne"
        vide="Choisir…"
        options={OPTIONS_NATURES}
      />
      <ListeDeroulante
        etat={etat}
        nom="accessoireId"
        libelle="Article (piles, accessoires)"
        vide="Aucun (entretien)"
        requis={false}
        options={accessoires.map((a) => ({ valeur: a.id, libelle: a.nom }))}
      />
      <ChampTexte etat={etat} nom="libelle" libelle="Libellé" requis />
      <ChampTexte etat={etat} nom="quantite" libelle="Quantité" defaut="1" requis />
      <ChampTexte etat={etat} nom="prixUnitaire" libelle="Prix unitaire TTC" requis />
      <div>
        <BoutonEnvoi variant="outline">Ajouter la ligne</BoutonEnvoi>
      </div>
    </form>
  );
}

function BoutonAction({
  action,
  libelle,
  variante,
}: {
  action: () => Promise<EtatFormulaire>;
  libelle: string;
  variante?: 'outline';
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi {...(variante ? { variant: variante } : {})}>{libelle}</BoutonEnvoi>
      </div>
    </form>
  );
}

export function BoutonValider({ factureId }: { factureId: string }) {
  return <BoutonAction action={validerAction.bind(null, factureId)} libelle="Valider la facture" />;
}

/** Décoché, le patient avance la part AMO : aucune créance sur la caisse à la validation. */
export function FormulaireTiersPayant({
  factureId,
  dossierId,
  tiersPayantAmo,
}: {
  factureId: string;
  dossierId: string | null;
  tiersPayantAmo: boolean;
}) {
  const [etat, envoyer] = useActionState(
    modifierTiersPayantAction.bind(null, factureId, dossierId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <CaseACocher
        etat={etat}
        nom="tiersPayantAmo"
        libelle="Tiers payant AMO (le patient n’avance pas la part de la caisse)"
        defaut={tiersPayantAmo}
      />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer le tiers payant</BoutonEnvoi>
      </div>
    </form>
  );
}

export function BoutonConfirmerCouverture({ factureId }: { factureId: string }) {
  return (
    <BoutonAction
      action={confirmerCouvertureAction.bind(null, factureId)}
      libelle="Confirmer la couverture saisie"
      variante="outline"
    />
  );
}

export function BoutonPreparerFse({ factureId, libelle }: { factureId: string; libelle: string }) {
  return (
    <BoutonAction
      action={preparerFseAction.bind(null, factureId)}
      libelle={libelle}
      variante="outline"
    />
  );
}

export function BoutonActualiserFse({ factureId }: { factureId: string }) {
  return (
    <BoutonAction
      action={actualiserFseAction.bind(null, factureId)}
      libelle="Actualiser le statut"
      variante="outline"
    />
  );
}

export function FormulaireEnvoi({
  factureId,
  canaux,
}: {
  factureId: string;
  canaux: readonly CanalNotification[];
}) {
  const [etat, envoyer] = useActionState(envoyerFactureAction.bind(null, factureId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="canal"
        libelle="Canal"
        vide="Choisir…"
        options={canaux.map((valeur) => ({ valeur, libelle: LIBELLES_CANAUX[valeur] }))}
      />
      <div>
        <BoutonEnvoi variant="outline">Envoyer un lien sécurisé</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireAvoir({
  factureId,
  lignes,
}: {
  factureId: string;
  lignes: readonly LigneDetail[];
}) {
  const [etat, envoyer] = useActionState(emettreAvoirAction.bind(null, factureId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="mode"
        libelle="Type d’avoir"
        vide="Choisir…"
        options={[
          { valeur: 'PARTIEL', libelle: 'Partiel, sur les montants ci-dessous' },
          { valeur: 'TOTAL', libelle: 'Total : annule la vente et rouvre la facturation' },
        ]}
      />
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" requis />
      {lignes.map((l) => (
        <div key={l.id} className="grid gap-1">
          <input type="hidden" name="ligneId" value={l.id} />
          <Label htmlFor={`montant-${l.id}`}>{l.libelle}</Label>
          <Input id={`montant-${l.id}`} name="montant" inputMode="decimal" placeholder="0,00" />
        </div>
      ))}
      <div>
        <BoutonEnvoi variant="outline">Émettre l’avoir</BoutonEnvoi>
      </div>
    </form>
  );
}
