'use client';

import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireOrganisation({
  action,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="raisonSociale" libelle="Raison sociale" requis />
      <ChampTexte etat={etat} nom="siren" libelle="SIREN" inputMode="numeric" requis />
      <ChampTexte etat={etat} nom="adresseLigne1" libelle="Adresse" requis />
      <ChampTexte etat={etat} nom="adresseLigne2" libelle="Complément d’adresse" />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <ChampTexte etat={etat} nom="codePostal" libelle="Code postal" inputMode="numeric" requis />
        <ChampTexte etat={etat} nom="ville" libelle="Ville" requis />
      </div>
      <ListeDeroulante
        etat={etat}
        nom="statut"
        libelle="Statut"
        defaut="ESSAI"
        options={[
          { valeur: 'ESSAI', libelle: 'Essai' },
          { valeur: 'ACTIF', libelle: 'Actif' },
        ]}
      />
      <h2 className="font-medium">Premier administrateur</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="adminPrenom" libelle="Prénom" requis />
        <ChampTexte etat={etat} nom="adminNom" libelle="Nom" requis />
      </div>
      <ChampTexte etat={etat} nom="adminEmail" libelle="E-mail" type="email" requis />
      <ChampTexte
        etat={etat}
        nom="motDePasse"
        libelle="Mot de passe provisoire"
        type="password"
        autoComplete="new-password"
        aide="À changer à la première connexion, avec activation de la 2FA."
        requis
      />
      <div>
        <BoutonEnvoi>Créer le client</BoutonEnvoi>
      </div>
    </form>
  );
}
