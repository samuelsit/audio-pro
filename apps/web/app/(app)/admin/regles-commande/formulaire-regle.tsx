'use client';

import {
  DECISIONS_REGLE,
  LIBELLES_DECISION_REGLE,
  LIBELLES_TYPE_PRODUIT,
  TYPES_PRODUIT_COMMANDE,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { RegleCommandeVue } from '@/server/services/regles-commande';

type Choix = readonly { id: string; nom: string }[];

export function FormulaireRegle({
  action,
  regle,
  fournisseurs,
  centres,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  regle?: RegleCommandeVue;
  fournisseurs: Choix;
  centres: Choix;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="libelle" libelle="Libellé" defaut={regle?.libelle} requis />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte
          etat={etat}
          nom="priorite"
          libelle="Priorité"
          inputMode="numeric"
          defaut={regle?.priorite.toString() ?? '10'}
          requis
          aide="La plus basse est examinée d’abord."
        />
        <ListeDeroulante
          etat={etat}
          nom="decision"
          libelle="Décision"
          options={DECISIONS_REGLE.map((d) => ({
            valeur: d,
            libelle: LIBELLES_DECISION_REGLE[d],
          }))}
          defaut={regle?.decision ?? 'APPROBATION'}
        />
      </div>
      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Critères, vides pour tout accepter</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="montantMaxCentimes"
            libelle="Montant maximal (€)"
            defaut={
              regle?.montantMaxCentimes == null
                ? ''
                : (regle.montantMaxCentimes / 100).toFixed(2).replace('.', ',')
            }
          />
          <ListeDeroulante
            etat={etat}
            nom="typeProduit"
            libelle="Type de produit"
            options={TYPES_PRODUIT_COMMANDE.map((t) => ({
              valeur: t,
              libelle: LIBELLES_TYPE_PRODUIT[t],
            }))}
            defaut={regle?.typeProduit ?? ''}
            vide="Tous"
            requis={false}
          />
          <ListeDeroulante
            etat={etat}
            nom="fournisseurId"
            libelle="Fournisseur"
            options={fournisseurs.map((f) => ({ valeur: f.id, libelle: f.nom }))}
            defaut={regle?.fournisseurId ?? ''}
            vide="Tous"
            requis={false}
          />
          <ListeDeroulante
            etat={etat}
            nom="centreId"
            libelle="Centre"
            options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
            defaut={regle?.centreId ?? ''}
            vide="Tous"
            requis={false}
          />
        </div>
      </fieldset>
      <CaseACocher etat={etat} nom="actif" libelle="Active" defaut={regle?.actif ?? true} />
      <div>
        <BoutonEnvoi>{regle ? 'Enregistrer' : 'Créer la règle'}</BoutonEnvoi>
      </div>
    </form>
  );
}
