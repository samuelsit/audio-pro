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
import type { LigneCommandeVue, ProduitCommandable } from '@/server/services/commandes';

import { SaisieNumerosSerie } from '../stock/reception/saisie-numeros-serie';
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

export function FormulaireAccuse({ action }: { action: Action }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-3">
      <MessageFormulaire etat={etat} />
      <ChampTexte
        etat={etat}
        nom="referenceFournisseur"
        libelle="Référence du fabricant"
        aide="Numéro donné par le fabricant, s’il en a communiqué un."
      />
      <div>
        <BoutonEnvoi>Noter l’accusé</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireReception({
  action,
  lignes,
  aujourdhui,
}: {
  action: Action;
  lignes: readonly LigneCommandeVue[];
  aujourdhui: string;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="referenceBonLivraison" libelle="Bon de livraison" requis />
        <ChampTexte
          etat={etat}
          nom="dateReception"
          libelle="Date de réception"
          type="date"
          defaut={aujourdhui}
          requis
        />
      </div>
      {lignes.map((l) => (
        <fieldset key={l.id} className="grid max-w-2xl gap-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">{l.designation}</legend>
          <p className="text-sm text-muted-foreground">
            Commandé {l.quantite} · déjà reçu {l.quantiteRecue}
            {l.referencePatient ? ` · nominative ${l.referencePatient}` : ''}
          </p>
          {l.modeleId === null ? (
            <ChampTexte
              etat={etat}
              nom={`quantite-${l.id}`}
              libelle="Quantité reçue"
              inputMode="numeric"
            />
          ) : (
            <SaisieNumerosSerie erreurs={etat.erreurs?.numerosSerie} nom={`numeros-${l.id}`} />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <ChampTexte
              etat={etat}
              nom={`nonConforme-${l.id}`}
              libelle="Reçu non conforme"
              inputMode="numeric"
              aide="N’entre pas en stock."
            />
            <ChampTexte etat={etat} nom={`commentaire-${l.id}`} libelle="Commentaire" />
          </div>
        </fieldset>
      ))}
      {etat.erreurs?.lignes ? (
        <p className="text-sm text-destructive">{etat.erreurs.lignes.join(' ')}</p>
      ) : null}
      <div>
        <BoutonEnvoi>Enregistrer la réception</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireEcart({ action }: { action: Action }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="statut"
        libelle="Traitement"
        options={[
          { valeur: 'ACCEPTE', libelle: 'Accepter' },
          { valeur: 'CONTESTE', libelle: 'Contester' },
          { valeur: 'RESOLU', libelle: 'Résolu' },
        ]}
        vide="Choisir…"
      />
      <ChampTexte etat={etat} nom="commentaire" libelle="Commentaire" requis />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
