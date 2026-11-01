'use client';

import { OREILLES_COMMANDE } from '@ha/domain';
import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { ProduitCommandable } from '@/server/services/commandes';

import { SelecteurPatient } from '../stock/selecteur-patient';
import { creerCommandeAction } from './actions';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

const LIBELLES_OREILLE = { DROITE: 'Droite', GAUCHE: 'Gauche' } as const;

export function FormulaireNouvelleCommande({
  centres,
  centreId,
  fournisseurs,
}: {
  centres: readonly { id: string; nom: string }[];
  centreId: string | undefined;
  fournisseurs: readonly { id: string; nom: string }[];
}) {
  const [etat, envoyer] = useActionState(creerCommandeAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="centreId"
          libelle="Centre livré"
          options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          defaut={centreId}
          vide="Choisir…"
        />
        <ListeDeroulante
          etat={etat}
          nom="fournisseurId"
          libelle="Fournisseur"
          options={fournisseurs.map((f) => ({ valeur: f.id, libelle: f.nom }))}
          vide="Choisir…"
        />
      </div>
      <div>
        <BoutonEnvoi>Créer la demande</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireLigne({
  action,
  produits,
  centreId,
  saisitPrix,
}: {
  action: Action;
  produits: readonly ProduitCommandable[];
  centreId: string;
  saisitPrix: boolean;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [nominative, setNominative] = useState(false);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4 rounded-lg border p-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="produit"
        libelle="Produit"
        options={produits.map((p) => ({ valeur: p.valeur, libelle: p.libelle }))}
        vide="Choisir…"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="quantite" libelle="Quantité" inputMode="numeric" requis />
        {saisitPrix ? (
          <ChampTexte
            etat={etat}
            nom="prixAchatCentimes"
            libelle="Prix d’achat unitaire (€)"
            aide="Vide : prix du catalogue."
          />
        ) : null}
      </div>
      <CaseACocher etat={etat} nom="enConsignation" libelle="En consignation" defaut={false} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={nominative}
          onChange={(e) => setNominative(e.target.checked)}
        />
        Commande nominative (embout, intra sur mesure)
      </label>
      {nominative ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelecteurPatient centreId={centreId} erreurs={etat.erreurs?.patientId} />
          <ListeDeroulante
            etat={etat}
            nom="oreille"
            libelle="Oreille"
            options={OREILLES_COMMANDE.map((o) => ({
              valeur: o,
              libelle: LIBELLES_OREILLE[o],
            }))}
            vide="Non précisée"
            requis={false}
          />
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Seul un code interne figure sur le bon de commande : ni nom ni donnée de santé.
          </p>
        </div>
      ) : null}
      <div>
        <BoutonEnvoi>Ajouter la ligne</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulairePrix({ action, defaut }: { action: Action; defaut: string }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="flex items-end gap-2">
      <ChampTexte etat={etat} nom="prixAchatCentimes" libelle="Prix (€)" defaut={defaut} />
      <BoutonEnvoi>OK</BoutonEnvoi>
    </form>
  );
}

export function FormulaireMotif({
  action,
  libelle,
  bouton,
}: {
  action: Action;
  libelle: string;
  bouton: string;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3">
      <MessageFormulaire etat={etat} />
      <ZoneDeTexte etat={etat} nom="motif" libelle={libelle} requis />
      <div>
        <BoutonEnvoi>{bouton}</BoutonEnvoi>
      </div>
    </form>
  );
}
