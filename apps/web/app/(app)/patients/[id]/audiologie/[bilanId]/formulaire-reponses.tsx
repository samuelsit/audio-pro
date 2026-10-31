'use client';

import type { DefinitionFormulaire, Question, Reponses } from '@ha/domain';
import { REPONSE_NON, REPONSE_OUI } from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

const OPTIONS_OUI_NON = [
  { valeur: REPONSE_OUI, libelle: 'Oui' },
  { valeur: REPONSE_NON, libelle: 'Non' },
];

function Champ({
  etat,
  question,
  defaut,
}: {
  etat: EtatFormulaire;
  question: Question;
  defaut: string | undefined;
}) {
  const commun = { etat, nom: question.id, libelle: question.libelle, defaut };
  switch (question.type) {
    case 'TEXTE':
      return <ZoneDeTexte {...commun} requis={question.obligatoire} lignes={2} />;
    case 'OUI_NON':
      return (
        <ListeDeroulante
          {...commun}
          vide="—"
          requis={question.obligatoire}
          options={OPTIONS_OUI_NON}
        />
      );
    case 'CHOIX':
      return (
        <ListeDeroulante
          {...commun}
          vide="—"
          requis={question.obligatoire}
          options={question.options.map((o) => ({ valeur: o, libelle: o }))}
        />
      );
    case 'ECHELLE':
      return (
        <ChampTexte
          {...commun}
          requis={question.obligatoire}
          inputMode="numeric"
          aide={`De ${String(question.min)} à ${String(question.max)}.`}
        />
      );
  }
}

export function FormulaireReponses({
  action,
  definition,
  reponses,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  definition: DefinitionFormulaire;
  reponses: Reponses;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-3xl gap-6">
      <MessageFormulaire etat={etat} />
      {definition.sections.map(({ titre, questions }) => (
        <fieldset key={titre} className="grid gap-3">
          <legend className="mb-1 text-base font-semibold">{titre}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {questions.map((q) => {
              const reponse = reponses[q.id];
              return (
                <Champ
                  key={q.id}
                  etat={etat}
                  question={q}
                  defaut={reponse === undefined ? undefined : String(reponse)}
                />
              );
            })}
          </div>
        </fieldset>
      ))}
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
