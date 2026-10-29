'use client';

import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CasesCentres,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { PraticienDetail } from '@/server/services/praticiens';

export function FormulairePraticien({
  action,
  centres,
  audios,
  praticien,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  centres: readonly { id: string; nom: string; actif: boolean }[];
  /** Utilisateurs AUDIO sans fiche (création uniquement). */
  audios?: readonly { id: string; prenom: string; nom: string }[];
  praticien?: PraticienDetail;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      {audios ? (
        <ListeDeroulante
          etat={etat}
          nom="utilisateurId"
          libelle="Audioprothésiste"
          vide="Choisir un utilisateur…"
          options={audios.map((u) => ({ valeur: u.id, libelle: `${u.prenom} ${u.nom}` }))}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="rpps"
          libelle="N° RPPS"
          defaut={praticien?.rpps}
          inputMode="numeric"
          aide="11 chiffres."
          requis
        />
        <ChampTexte etat={etat} nom="adeli" libelle="N° ADELI" defaut={praticien?.adeli} />
      </div>
      <CasesCentres
        etat={etat}
        legende="Centres d’exercice"
        aide="Parmi les centres de rattachement de l’utilisateur."
        centres={centres}
        coches={praticien?.centreIds ?? []}
      />
      <div>
        <BoutonEnvoi>{praticien ? 'Enregistrer' : 'Créer la fiche'}</BoutonEnvoi>
      </div>
    </form>
  );
}
