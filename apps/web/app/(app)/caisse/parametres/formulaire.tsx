'use client';

import {
  COLONNES_FEC,
  LIBELLES_MODES_PAIEMENT,
  LIBELLES_NATURES_LIGNE_FACTURE,
  MODES_PAIEMENT,
  NATURES_LIGNE_FACTURE,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { ParametresComptablesVue } from '@/server/services/caisse';

import { modifierParametresAction } from '../actions';

const MOIS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function FormulaireParametres({
  centreId,
  parametres: { comptes, profil, moisClotureExercice },
}: {
  centreId: string;
  parametres: ParametresComptablesVue;
}) {
  const [etat, envoyer] = useActionState(
    modifierParametresAction.bind(null, centreId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="moisClotureExercice"
        libelle="Dernier mois de l’exercice"
        vide="Choisir…"
        defaut={String(moisClotureExercice)}
        options={MOIS.map((libelle, index) => ({ valeur: String(index + 1), libelle }))}
      />
      <h2 className="text-lg font-medium">Journaux</h2>
      <ChampTexte
        etat={etat}
        nom="journalVentes"
        libelle="Code du journal de ventes"
        defaut={comptes.journalVentes}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="journalVentesLibelle"
        libelle="Libellé du journal de ventes"
        defaut={comptes.journalVentesLibelle}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="journalTresorerie"
        libelle="Code du journal d’encaissements"
        defaut={comptes.journalTresorerie}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="journalTresorerieLibelle"
        libelle="Libellé du journal d’encaissements"
        defaut={comptes.journalTresorerieLibelle}
        requis
      />
      <h2 className="text-lg font-medium">Comptes</h2>
      <ChampTexte
        etat={etat}
        nom="compteClients"
        libelle="Clients"
        defaut={comptes.compteClients}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="compteAmo"
        libelle="Assurance maladie"
        defaut={comptes.compteAmo}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="compteAmc"
        libelle="Organismes complémentaires"
        defaut={comptes.compteAmc}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="compteAcomptes"
        libelle="Acomptes reçus"
        defaut={comptes.compteAcomptes}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="compteTva"
        libelle="TVA collectée"
        defaut={comptes.compteTva}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="compteEcartNegatif"
        libelle="Écart de caisse négatif"
        defaut={comptes.compteEcartNegatif}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="compteEcartPositif"
        libelle="Écart de caisse positif"
        defaut={comptes.compteEcartPositif}
        requis
      />
      {NATURES_LIGNE_FACTURE.map((nature) => (
        <ChampTexte
          key={nature}
          etat={etat}
          nom={`vente-${nature}`}
          libelle={`Ventes : ${LIBELLES_NATURES_LIGNE_FACTURE[nature]}`}
          defaut={comptes.ventes[nature]}
          requis
        />
      ))}
      {MODES_PAIEMENT.map((mode) => (
        <ChampTexte
          key={mode}
          etat={etat}
          nom={`tresorerie-${mode}`}
          libelle={`Encaissements : ${LIBELLES_MODES_PAIEMENT[mode]}`}
          defaut={comptes.tresorerie[mode]}
          requis
        />
      ))}
      <h2 className="text-lg font-medium">Format d’export</h2>
      <ChampTexte etat={etat} nom="profilNom" libelle="Nom du format" defaut={profil.nom} requis />
      <ListeDeroulante
        etat={etat}
        nom="separateur"
        libelle="Séparateur"
        vide="Choisir…"
        defaut={profil.separateur === '\t' ? 'tab' : profil.separateur}
        options={[
          { valeur: ';', libelle: 'Point-virgule' },
          { valeur: ',', libelle: 'Virgule' },
          { valeur: '|', libelle: 'Barre verticale' },
          { valeur: 'tab', libelle: 'Tabulation' },
        ]}
      />
      <ListeDeroulante
        etat={etat}
        nom="decimale"
        libelle="Décimale"
        vide="Choisir…"
        defaut={profil.decimale}
        options={[
          { valeur: ',', libelle: 'Virgule' },
          { valeur: '.', libelle: 'Point' },
        ]}
      />
      <ListeDeroulante
        etat={etat}
        nom="formatDate"
        libelle="Format de date"
        vide="Choisir…"
        defaut={profil.formatDate}
        options={[
          { valeur: 'JJ/MM/AAAA', libelle: 'JJ/MM/AAAA' },
          { valeur: 'AAAAMMJJ', libelle: 'AAAAMMJJ' },
          { valeur: 'AAAA-MM-JJ', libelle: 'AAAA-MM-JJ' },
        ]}
      />
      <CaseACocher
        etat={etat}
        nom="entete"
        libelle="Noms des colonnes en première ligne"
        defaut={profil.entete}
      />
      <fieldset className="grid gap-1">
        <legend className="text-sm font-medium">Colonnes</legend>
        {COLONNES_FEC.map((colonne) => (
          <CaseACocher
            key={colonne}
            etat={etat}
            nom={`colonne-${colonne}`}
            libelle={colonne}
            defaut={profil.colonnes.includes(colonne)}
          />
        ))}
      </fieldset>
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
