'use client';

import { LIBELLES_ROLES, LONGUEUR_MIN_MOT_DE_PASSE, ROLES } from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  CasesCentres,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { UtilisateurDetail } from '@/server/services/utilisateurs';

export function FormulaireUtilisateur({
  action,
  centres,
  utilisateur,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  centres: readonly { id: string; nom: string; actif: boolean }[];
  utilisateur?: UtilisateurDetail;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="prenom" libelle="Prénom" defaut={utilisateur?.prenom} requis />
        <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={utilisateur?.nom} requis />
      </div>
      <ChampTexte
        etat={etat}
        nom="email"
        libelle="Adresse e-mail (identifiant de connexion)"
        type="email"
        defaut={utilisateur?.email}
        requis
      />
      <ListeDeroulante
        etat={etat}
        nom="role"
        libelle="Rôle"
        defaut={utilisateur?.role ?? 'ASSISTANT'}
        options={ROLES.map((r) => ({ valeur: r, libelle: LIBELLES_ROLES[r] }))}
      />
      <CasesCentres
        etat={etat}
        legende="Centres de rattachement"
        aide="Obligatoire sauf pour un administrateur, qui accède à tous les centres."
        centres={centres}
        coches={utilisateur?.centreIds ?? []}
      />
      {utilisateur ? null : (
        <ChampTexte
          etat={etat}
          nom="motDePasse"
          libelle="Mot de passe provisoire"
          type="password"
          autoComplete="new-password"
          aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères. L’utilisateur devra le changer à sa première connexion.`}
          requis
        />
      )}
      <CaseACocher
        etat={etat}
        nom="actif"
        libelle="Compte actif"
        defaut={utilisateur?.actif ?? true}
      />
      <div>
        <BoutonEnvoi>{utilisateur ? 'Enregistrer' : 'Créer le compte'}</BoutonEnvoi>
      </div>
    </form>
  );
}
