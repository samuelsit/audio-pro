'use client';

import {
  LIBELLES_OREILLES_DOSSIER,
  LIBELLES_OREILLES,
  LIBELLES_TYPES_APPAREILLAGE,
  OREILLES_DOSSIER,
  oreillesConcernees,
  TYPES_APPAREILLAGE,
  type Oreille,
  type OreillesDossier,
} from '@ha/domain';
import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { DonneesCreationDossier } from '@/server/services/dossiers';

import { creerDossierAction } from './actions';

const OPTIONS_OREILLES = OREILLES_DOSSIER.map((valeur) => ({
  valeur,
  libelle: LIBELLES_OREILLES_DOSSIER[valeur],
}));

const OPTIONS_TYPES = TYPES_APPAREILLAGE.map((valeur) => ({
  valeur,
  libelle: LIBELLES_TYPES_APPAREILLAGE[valeur],
}));

const CHAMPS_TYPE: Readonly<Record<Oreille, string>> = {
  DROITE: 'typeDroite',
  GAUCHE: 'typeGauche',
};

function estOreilles(valeur: string): valeur is OreillesDossier {
  return (OREILLES_DOSSIER as readonly string[]).includes(valeur);
}

export function FormulaireDossier({
  patientId,
  donnees: { centres, centreParDefaut, praticienParDefaut },
  origine,
}: {
  patientId: string;
  donnees: DonneesCreationDossier;
  origine: { rdvId: string | null; bilanId: string | null };
}) {
  const [etat, envoyer] = useActionState(creerDossierAction.bind(null, patientId), ETAT_INITIAL);
  const [centreId, setCentreId] = useState(centreParDefaut ?? '');
  const [oreilles, setOreilles] = useState<OreillesDossier | ''>('');
  const praticiens = centres.find((c) => c.id === centreId)?.praticiens ?? [];

  return (
    <form action={envoyer} className="grid max-w-xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="rdvId" value={origine.rdvId ?? ''} />
      <input type="hidden" name="bilanId" value={origine.bilanId ?? ''} />
      <ListeDeroulante
        etat={etat}
        nom="centreId"
        libelle="Centre"
        options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
        defaut={centreId}
        vide="Choisir…"
        surChangement={setCentreId}
      />
      {/* La liste dépend du centre : elle repart de zéro quand il change. */}
      <div key={centreId}>
        <ListeDeroulante
          etat={etat}
          nom="praticienId"
          libelle="Audioprothésiste"
          options={praticiens.map((p) => ({ valeur: p.id, libelle: p.nom }))}
          defaut={praticiens.find((p) => p.id === praticienParDefaut)?.id ?? ''}
          vide="Choisir…"
        />
      </div>
      <ListeDeroulante
        etat={etat}
        nom="oreilles"
        libelle="Oreilles à appareiller"
        options={OPTIONS_OREILLES}
        defaut={oreilles}
        vide="Choisir…"
        surChangement={(valeur) => setOreilles(estOreilles(valeur) ? valeur : '')}
      />
      {oreilles === ''
        ? null
        : oreillesConcernees(oreilles).map((oreille) => (
            <ListeDeroulante
              key={oreille}
              etat={etat}
              nom={CHAMPS_TYPE[oreille]}
              libelle={`${LIBELLES_OREILLES[oreille]} : type d’appareillage`}
              options={OPTIONS_TYPES}
              vide="Choisir…"
            />
          ))}
      <CaseACocher
        etat={etat}
        nom="surdicecite"
        libelle="Personne sourde et aveugle"
        defaut={false}
      />
      <div>
        <BoutonEnvoi>Créer le dossier</BoutonEnvoi>
      </div>
    </form>
  );
}
