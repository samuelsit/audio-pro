'use client';

import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { AccessoireResume } from '@/server/services/catalogue';

import { mouvementAccessoireAction } from '../../actions';

const TYPES = [
  { valeur: 'ENTREE', libelle: 'Entrée' },
  { valeur: 'SORTIE', libelle: 'Sortie' },
  { valeur: 'TRANSFERT', libelle: 'Transfert vers un autre centre' },
];

export function FormulaireMouvementAccessoire({
  centres,
  centreId,
  destinations,
  accessoires,
}: {
  centres: readonly { id: string; nom: string }[];
  centreId: string | undefined;
  destinations: readonly { id: string; nom: string }[];
  accessoires: readonly AccessoireResume[];
}) {
  const [etat, envoyer] = useActionState(mouvementAccessoireAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante etat={etat} nom="type" libelle="Mouvement" options={TYPES} />
        <ListeDeroulante
          etat={etat}
          nom="centreId"
          libelle="Centre"
          vide="Choisir un centre…"
          defaut={centreId}
          options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
        />
        <ListeDeroulante
          etat={etat}
          nom="accessoireId"
          libelle="Accessoire"
          vide="Choisir un accessoire…"
          options={accessoires.map((a) => ({ valeur: a.id, libelle: a.nom }))}
        />
        <ChampTexte etat={etat} nom="quantite" libelle="Quantité" inputMode="numeric" requis />
        <ListeDeroulante
          etat={etat}
          nom="centreDestinationId"
          libelle="Centre de destination (transfert)"
          vide="Sans objet"
          requis={false}
          options={destinations.map((c) => ({ valeur: c.id, libelle: c.nom }))}
        />
      </div>
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" lignes={3} requis />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
