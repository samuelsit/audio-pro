'use client';

import { LIBELLES_TYPE_FOURNISSEUR, TYPES_FOURNISSEUR } from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { FournisseurDetail } from '@/server/services/fournisseurs';

type Choix = readonly { id: string; nom: string }[];

export function FormulaireFournisseur({
  action,
  fournisseur,
  fabricants,
  centrales,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  fournisseur?: FournisseurDetail;
  fabricants: Choix;
  centrales: Choix;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="type"
          libelle="Type"
          options={TYPES_FOURNISSEUR.map((t) => ({
            valeur: t,
            libelle: LIBELLES_TYPE_FOURNISSEUR[t],
          }))}
          defaut={fournisseur?.type ?? 'FABRICANT'}
        />
        <ListeDeroulante
          etat={etat}
          nom="fabricantId"
          libelle="Fabricant du catalogue"
          options={fabricants.map((f) => ({ valeur: f.id, libelle: f.nom }))}
          defaut={fournisseur?.fabricantId ?? ''}
          vide="Aucun"
          requis={false}
        />
      </div>
      <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={fournisseur?.nom} requis />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="emailCommande"
          libelle="E-mail de commande"
          type="email"
          defaut={fournisseur?.emailCommande}
          aide="Sans elle, une commande ne peut pas partir."
        />
        <ChampTexte
          etat={etat}
          nom="emailFacturation"
          libelle="E-mail de facturation"
          type="email"
          defaut={fournisseur?.emailFacturation}
          aide="Reconnaît l’expéditeur des factures reçues."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="telephone"
          libelle="Téléphone"
          type="tel"
          defaut={fournisseur?.telephone}
        />
        <ChampTexte
          etat={etat}
          nom="siret"
          libelle="SIRET"
          inputMode="numeric"
          defaut={fournisseur?.siret}
          aide="Reconnaît le fournisseur sur une facture."
        />
      </div>
      <ChampTexte etat={etat} nom="adresse" libelle="Adresse" defaut={fournisseur?.adresse} />
      <ZoneDeTexte
        etat={etat}
        nom="conditions"
        libelle="Conditions"
        defaut={fournisseur?.conditions}
        aide="Paiement, franco de port, délais."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="centraleAchatId"
          libelle="Centrale d’achat"
          options={centrales.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          defaut={fournisseur?.centraleAchatId ?? ''}
          vide="Aucune"
          requis={false}
        />
        <ChampTexte
          etat={etat}
          nom="delaiRelanceJours"
          libelle="Délai de relance (jours)"
          inputMode="numeric"
          defaut={fournisseur?.delaiRelanceJours?.toString()}
          aide="Vide : délai général du client."
        />
      </div>
      <CaseACocher etat={etat} nom="actif" libelle="Actif" defaut={fournisseur?.actif ?? true} />
      <div>
        <BoutonEnvoi>{fournisseur ? 'Enregistrer' : 'Créer le fournisseur'}</BoutonEnvoi>
      </div>
    </form>
  );
}
